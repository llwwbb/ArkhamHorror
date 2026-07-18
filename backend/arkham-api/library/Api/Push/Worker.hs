{-# LANGUAGE DuplicateRecordFields #-}

module Api.Push.Worker (pushNotificationWorker) where

import Api.Push.Notifications (
  FcmResponseClass (..),
  captureTransportFailure,
  classifyFcmResponse,
  localizedTurnNotification,
  retryDelayWithHeader,
  workerConfigurationPresent,
 )
import Control.Concurrent (threadDelay)
import Control.Exception (bracket)
import Control.Lens ((?~))
import Crypto.JWT
import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.ByteString.Lazy qualified as BSL
import Data.Text qualified as Text
import Data.Text.Encoding qualified as Text
import Data.Text.IO qualified as Text
import Data.Time.Clock
import Data.Traversable (for)
import Data.X509 (PrivKey (..))
import Data.X509.File (readKeyFile)
import Database.Persist (Entity (..))
import Database.Persist qualified as P
import Database.Persist.Sql (runSqlPool)
import Database.Persist.Sql qualified as Sql
import Foundation (App (..))
import Model
import Network.HTTP.Simple
import Network.HTTP.Types.Status (statusCode)
import Prelude qualified
import Relude
import System.Directory (removeFile)
import System.IO (hClose, openTempFile)
import System.Posix.Files (setFileMode)
import UnliftIO.Exception (catchAny)
import Yesod.Core (toPathPiece)

data ServiceAccount = ServiceAccount
  { projectId :: Text
  , clientEmail :: Text
  , privateKey :: Text
  }

instance Aeson.FromJSON ServiceAccount where
  parseJSON = Aeson.withObject "ServiceAccount" \o ->
    ServiceAccount <$> o Aeson..: "project_id" <*> o Aeson..: "client_email" <*> o Aeson..: "private_key"

data OAuthToken = OAuthToken
  { accessToken :: Text
  , expiresIn :: Int
  }

instance Aeson.FromJSON OAuthToken where
  parseJSON = Aeson.withObject "OAuthToken" \o ->
    OAuthToken <$> o Aeson..: "access_token" <*> o Aeson..: "expires_in"

data GoogleOAuthClaims = GoogleOAuthClaims
  { jwtClaims :: ClaimsSet
  , scope :: Text
  }

instance HasClaimsSet GoogleOAuthClaims where
  claimsSet f claims = (\updated -> claims {jwtClaims = updated}) <$> f claims.jwtClaims

instance Aeson.ToJSON GoogleOAuthClaims where
  toJSON claims = case Aeson.toJSON claims.jwtClaims of
    Aeson.Object object -> Aeson.Object $ KeyMap.insert "scope" (Aeson.String claims.scope) object
    value -> value

data WorkerConfig = WorkerConfig
  { serviceAccount :: ServiceAccount
  , signingKey :: JWK
  , webOrigin :: Text
  , tokenCache :: TVar (Maybe (Text, UTCTime))
  }

data DeliveryResult
  = Delivered
  | InvalidToken
  | RetryDelivery (Maybe Text) Text
  | PermanentFailure Text
  deriving stock (Eq)

pushNotificationWorker :: App -> IO ()
pushNotificationWorker app = do
  mCredentials <- lookupEnv "GOOGLE_APPLICATION_CREDENTIALS"
  mOrigin <- lookupEnv "FCM_WEB_ORIGIN"
  case (mCredentials, mOrigin) of
    (Just credentialsPath, Just origin)
      | workerConfigurationPresent (Just $ Text.pack credentialsPath) (Just $ Text.pack origin) -> do
          config <- loadWorkerConfig credentialsPath (Text.pack origin)
          forever do
            processBatch app config `catchAny` \err ->
              putTextLn $ "FCM worker error: " <> toText (displayException err)
            threadDelay 2000000
    _ -> pure ()

loadWorkerConfig :: FilePath -> Text -> IO WorkerConfig
loadWorkerConfig path webOrigin = do
  serviceAccount <- Aeson.eitherDecodeFileStrict' path >>= either fail pure
  signingKey <- loadSigningKey serviceAccount.privateKey
  tokenCache <- newTVarIO Nothing
  pure WorkerConfig {..}

loadSigningKey :: Text -> IO JWK
loadSigningKey pem = bracket acquire cleanup \path -> do
  readKeyFile path >>= \case
    [PrivKeyRSA key] -> pure $ fromRSA key
    _ -> fail "FCM service account must contain one RSA private key"
 where
  acquire = do
    (path, handle) <- openTempFile "/tmp" "arkham-fcm-key"
    setFileMode path 0o600
    Text.hPutStr handle pem
    hClose handle
    pure path
  cleanup path = catchAny (removeFile path) (const $ pure ())

processBatch :: App -> WorkerConfig -> IO ()
processBatch app config = do
  now <- getCurrentTime
  rows <- flip runSqlPool app.appConnPool
    $ P.selectList
      [ PushNotificationOutboxStatus P.<-. ["pending", "processing"]
      , PushNotificationOutboxNextAttemptAt P.<=. now
      ]
      [P.Asc PushNotificationOutboxCreatedAt, P.LimitTo 20]
  traverse_ (processOne app config now) rows

processOne :: App -> WorkerConfig -> UTCTime -> Entity PushNotificationOutbox -> IO ()
processOne app config now (Entity outboxId outbox) = do
  let leaseUntil = addUTCTime 300 now
  claimed <- flip runSqlPool app.appConnPool
    $ Sql.updateWhereCount
      [ PushNotificationOutboxId P.==. outboxId
      , PushNotificationOutboxNextAttemptAt P.<=. now
      ]
      [ PushNotificationOutboxStatus P.=. "processing"
      , PushNotificationOutboxNextAttemptAt P.=. leaseUntil
      ]
  when (claimed == 1) do
    subscriptions <- flip runSqlPool app.appConnPool
      $ P.selectList [PushSubscriptionUserId P.==. outbox.userId] []
    results <- for subscriptions \subscription -> do
      attempt <- captureTransportFailure do
        token <- getAccessToken config
        sendTurnNotification config token outbox (entityVal subscription)
      let result = either (RetryDelivery Nothing . ("FCM transport: " <>)) id attempt
      when (result == InvalidToken) $ flip runSqlPool app.appConnPool $ P.delete (entityKey subscription)
      pure result
    finishDelivery app now outboxId outbox results

finishDelivery
  :: App -> UTCTime -> PushNotificationOutboxId -> PushNotificationOutbox -> [DeliveryResult] -> IO ()
finishDelivery app now outboxId outbox results = flip runSqlPool app.appConnPool do
  case [(retryAfter, err) | RetryDelivery retryAfter err <- results] of
    retries@(_ : _) -> do
      let attempts = outbox.attempts + 1
          exhausted = attempts >= 8
          delay = foldl' max 0 $ map (retryDelayWithHeader attempts . fst) retries
          errors = map snd retries
          nextAttempt = addUTCTime (fromIntegral delay) now
      P.update outboxId
        [ PushNotificationOutboxStatus P.=. if exhausted then "failed" else "pending"
        , PushNotificationOutboxAttempts P.=. attempts
        , PushNotificationOutboxNextAttemptAt P.=. nextAttempt
        , PushNotificationOutboxLastError P.=. Just (Text.intercalate "; " errors)
        ]
    [] -> case [err | PermanentFailure err <- results] of
      [] -> P.update outboxId
        [ PushNotificationOutboxStatus P.=. "sent"
        , PushNotificationOutboxSentAt P.=. Just now
        , PushNotificationOutboxLastError P.=. Nothing
        ]
      errors -> P.update outboxId
        [ PushNotificationOutboxStatus P.=. "failed"
        , PushNotificationOutboxAttempts P.=. outbox.attempts + 1
        , PushNotificationOutboxLastError P.=. Just (Text.intercalate "; " errors)
        ]

getAccessToken :: WorkerConfig -> IO Text
getAccessToken config = do
  now <- getCurrentTime
  atomically (readTVar config.tokenCache) >>= \case
    Just (token, expiresAt) | addUTCTime 300 now < expiresAt -> pure token
    _ -> do
      (token, expiresAt) <- mintAccessToken config now
      atomically $ writeTVar config.tokenCache $ Just (token, expiresAt)
      pure token

mintAccessToken :: WorkerConfig -> UTCTime -> IO (Text, UTCTime)
mintAccessToken config now = do
  let oauthAudience = "https://oauth2.googleapis.com/token"
      registeredClaims =
        emptyClaimsSet
          & claimIss ?~ fromString (toString config.serviceAccount.clientEmail)
          & claimAud ?~ Audience [fromString oauthAudience]
          & claimIat ?~ NumericDate now
          & claimExp ?~ NumericDate (addUTCTime 3600 now)
      claims = GoogleOAuthClaims
        registeredClaims
        "https://www.googleapis.com/auth/firebase.messaging"
  signedResult <- runJOSE (signJWT config.signingKey (newJWSHeader ((), RS256)) claims)
  signed <- case signedResult of
    Left (err :: JWTError) -> fail $ Prelude.show err
    Right value -> pure value
  request <- parseRequest "POST https://oauth2.googleapis.com/token"
  response <- httpJSONEither
    $ setRequestBodyURLEncoded
      [ ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
      , ("assertion", BSL.toStrict $ encodeCompact signed)
      ]
    $ request
  OAuthToken {..} <- either (fail . show) pure $ getResponseBody response
  pure (accessToken, addUTCTime (fromIntegral expiresIn) now)

sendTurnNotification
  :: WorkerConfig -> Text -> PushNotificationOutbox -> PushSubscription -> IO DeliveryResult
sendTurnNotification config accessToken outbox subscription = do
  let (title, body) = localizedTurnNotification subscription.locale
      gameId = toPathPiece outbox.arkhamGameId
      link = Text.dropWhileEnd (== '/') config.webOrigin <> "/#/games/" <> gameId
      payload = Aeson.object
        [ "message" Aeson..= Aeson.object
          [ "token" Aeson..= subscription.fcmToken
          , "notification" Aeson..= Aeson.object ["title" Aeson..= title, "body" Aeson..= body]
          , "data" Aeson..= Aeson.object
            [ "kind" Aeson..= ("your_turn" :: Text)
            , "gameId" Aeson..= gameId
            , "gameStep" Aeson..= (show outbox.gameStep :: Text)
            ]
          , "webpush" Aeson..= Aeson.object
            [ "headers" Aeson..= Aeson.object
              [ "TTL" Aeson..= ("3600" :: Text), "Urgency" Aeson..= ("high" :: Text) ]
            , "fcm_options" Aeson..= Aeson.object ["link" Aeson..= link]
            , "notification" Aeson..= Aeson.object
              [ "tag" Aeson..= ("arkham-your-turn-" <> gameId), "renotify" Aeson..= False ]
            ]
          ]
        ]
      endpoint = "https://fcm.googleapis.com/v1/projects/"
        <> config.serviceAccount.projectId <> "/messages:send"
  request <- parseRequest $ "POST " <> toString endpoint
  response <- httpLBS
    $ setRequestHeader "Authorization" ["Bearer " <> Text.encodeUtf8 accessToken]
    $ setRequestHeader "Content-Type" ["application/json"]
    $ setRequestBodyJSON payload
    $ request
  let code = statusCode $ getResponseStatus response
      responseText = Text.decodeUtf8Lenient $ BSL.toStrict $ getResponseBody response
      retryAfter = viaNonEmpty head (getResponseHeader "Retry-After" response)
        <&> Text.decodeUtf8Lenient
      failure = "FCM " <> show code <> ": " <> Text.take 500 responseText
  pure $ case classifyFcmResponse code responseText of
    FcmSuccess -> Delivered
    FcmInvalidToken -> InvalidToken
    FcmRetryable -> RetryDelivery retryAfter failure
    FcmPermanentFailure -> PermanentFailure failure
