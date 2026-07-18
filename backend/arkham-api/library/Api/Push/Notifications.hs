module Api.Push.Notifications (
  FcmResponseClass (..),
  captureTransportFailure,
  classifyFcmResponse,
  localizedTurnNotification,
  newlyPendingPlayers,
  retryDelaySeconds,
  retryDelayWithHeader,
  validatePushSubscription,
  workerConfigurationPresent,
) where

import Data.Aeson qualified as Aeson
import Data.Aeson.KeyMap qualified as KeyMap
import Data.Map.Strict qualified as Map
import Data.Text qualified as Text
import Data.Text.Encoding qualified as Text
import Data.Vector qualified as Vector
import Control.Exception qualified as Exception
import Relude

data FcmResponseClass
  = FcmSuccess
  | FcmInvalidToken
  | FcmRetryable
  | FcmPermanentFailure
  deriving stock (Eq, Show)

newlyPendingPlayers :: Ord player => Map player question -> Map player question -> [player]
newlyPendingPlayers previous current = Map.keys $ current `Map.difference` previous

localizedTurnNotification :: Text -> (Text, Text)
localizedTurnNotification locale
  | "zh" `Text.isPrefixOf` Text.toLower locale = ("轮到你了", "你有待处理的选择，回到游戏继续吧。")
  | otherwise = ("Your Turn", "You have pending choices waiting in the game.")

validatePushSubscription :: Text -> Text -> Either Text ()
validatePushSubscription token locale
  | Text.null (Text.strip token) || Text.length token > 4096 =
      Left "Invalid FCM registration token"
  | Text.null locale || Text.length locale > 32 = Left "Invalid notification locale"
  | otherwise = Right ()

workerConfigurationPresent :: Maybe Text -> Maybe Text -> Bool
workerConfigurationPresent credentialsPath webOrigin =
  all (maybe False $ not . Text.null . Text.strip) [credentialsPath, webOrigin]

captureTransportFailure :: IO a -> IO (Either Text a)
captureTransportFailure action =
  (Right <$> action) `Exception.catch` \(err :: Exception.SomeException) ->
    pure $ Left $ toText $ Exception.displayException err

retryDelaySeconds :: Int -> Int
retryDelaySeconds attempts = min 3600 (60 * (2 ^ exponent))
 where
  exponent = min 6 $ max 0 (attempts - 1)

retryDelayWithHeader :: Int -> Maybe Text -> Int
retryDelayWithHeader attempts retryAfter =
  max (retryDelaySeconds attempts) $ fromMaybe 0 $ do
    value <- retryAfter >>= readMaybe . toString
    guard (value >= 0)
    pure value

classifyFcmResponse :: Int -> Text -> FcmResponseClass
classifyFcmResponse statusCode responseBody
  | statusCode >= 200 && statusCode < 300 = FcmSuccess
  | invalidRegistrationToken response = FcmInvalidToken
  | statusCode == 429 || statusCode >= 500 || transientStatus response = FcmRetryable
  | otherwise = FcmPermanentFailure
 where
  response = Aeson.decodeStrict' (Text.encodeUtf8 responseBody)

invalidRegistrationToken :: Maybe Aeson.Value -> Bool
invalidRegistrationToken response =
  maybe False (`elem` ["UNREGISTERED", "SENDER_ID_MISMATCH"]) (errorStatus response)
    || any isTokenDetail (errorDetails response)
 where
  isTokenDetail (Aeson.Object detail) =
    lookupText "@type" detail == Just "type.googleapis.com/google.firebase.fcm.v1.FcmError"
      && maybe False
        (`elem` ["INVALID_ARGUMENT", "UNREGISTERED", "SENDER_ID_MISMATCH"])
        (lookupText "errorCode" detail)
  isTokenDetail _ = False

transientStatus :: Maybe Aeson.Value -> Bool
transientStatus response =
  maybe False (`elem` ["RESOURCE_EXHAUSTED", "UNAVAILABLE", "INTERNAL"]) (errorStatus response)

errorStatus :: Maybe Aeson.Value -> Maybe Text
errorStatus response = errorObject response >>= lookupText "status"

errorDetails :: Maybe Aeson.Value -> [Aeson.Value]
errorDetails response = case errorObject response >>= KeyMap.lookup "details" of
  Just (Aeson.Array details) -> Vector.toList details
  _ -> []

errorObject :: Maybe Aeson.Value -> Maybe Aeson.Object
errorObject (Just (Aeson.Object root)) = case KeyMap.lookup "error" root of
  Just (Aeson.Object err) -> Just err
  _ -> Nothing
errorObject _ = Nothing

lookupText :: Aeson.Key -> Aeson.Object -> Maybe Text
lookupText key object = case KeyMap.lookup key object of
  Just (Aeson.String value) -> Just value
  _ -> Nothing
