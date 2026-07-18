module Api.Push.NotificationsSpec (spec) where

import Api.Push.Notifications
import Arkham.Id (PlayerId (..))
import Data.Map.Strict qualified as Map
import Data.Text (Text)
import Data.Text qualified as Text
import Data.UUID qualified as UUID
import Test.Hspec
import Prelude

playerId :: String -> PlayerId
playerId value = PlayerId $ maybe (error "invalid test player id") id (UUID.fromString value)

alice, bob :: PlayerId
alice = playerId "00000000-0000-0000-0000-000000000001"
bob = playerId "00000000-0000-0000-0000-000000000002"

spec :: Spec
spec = describe "newlyPendingPlayers" $ do
  it "returns a player whose question changed from absent to present" $ do
    newlyPendingPlayers (Map.empty :: Map.Map PlayerId ()) (Map.singleton alice ())
      `shouldBe` [alice]

  it "does not notify a player who already had a pending question" $ do
    newlyPendingPlayers (Map.singleton alice ()) (Map.singleton alice ())
      `shouldBe` []

  it "returns only newly pending players when questions change independently" $ do
    newlyPendingPlayers (Map.singleton alice ()) (Map.fromList [(alice, ()), (bob, ())])
      `shouldBe` [bob]

  describe "delivery policy" $ do
    it "localizes Chinese registrations and falls back to English" $ do
      localizedTurnNotification "zh-cn" `shouldBe` ("轮到你了", "你有待处理的选择，回到游戏继续吧。")
      localizedTurnNotification "fr" `shouldBe` ("Your Turn", "You have pending choices waiting in the game.")

    it "uses minute-based bounded exponential retry delays" $ do
      map retryDelaySeconds [1, 2, 3, 20] `shouldBe` [60, 120, 240, 3600]

    it "honors a longer Retry-After delay" $ do
      retryDelayWithHeader 2 (Just "900") `shouldBe` 900
      retryDelayWithHeader 2 (Just "invalid") `shouldBe` 120

    it "classifies successful and transient FCM responses" $ do
      classifyFcmResponse 200 "{}" `shouldBe` FcmSuccess
      classifyFcmResponse 429 quotaError `shouldBe` FcmRetryable
      classifyFcmResponse 503 unavailableError `shouldBe` FcmRetryable

    it "removes only tokens identified as invalid by FCM" $ do
      classifyFcmResponse 404 unregisteredError `shouldBe` FcmInvalidToken
      classifyFcmResponse 400 invalidTokenError `shouldBe` FcmInvalidToken
      classifyFcmResponse 400 invalidPayloadError `shouldBe` FcmPermanentFailure

    it "rejects empty or unreasonably large subscription fields" $ do
      validatePushSubscription "" "en" `shouldBe` Left "Invalid FCM registration token"
      validatePushSubscription "   " "en" `shouldBe` Left "Invalid FCM registration token"
      validatePushSubscription (Text.replicate 4097 "x") "en"
        `shouldBe` Left "Invalid FCM registration token"
      validatePushSubscription "token" (Text.replicate 33 "x")
        `shouldBe` Left "Invalid notification locale"
      validatePushSubscription "token" "" `shouldBe` Left "Invalid notification locale"
      validatePushSubscription "token" "zh-cn" `shouldBe` Right ()

    it "keeps the worker disabled when required configuration is blank" $ do
      workerConfigurationPresent (Just "/run/secrets/firebase.json") (Just "https://example.com")
        `shouldBe` True
      workerConfigurationPresent (Just "") (Just "https://example.com") `shouldBe` False
      workerConfigurationPresent (Just "/run/secrets/firebase.json") (Just "   ") `shouldBe` False

    it "captures transport exceptions for the retry policy" $ do
      result <- captureTransportFailure (ioError $ userError "offline" :: IO ())
      result `shouldBe` Left "user error (offline)"

quotaError, unavailableError, unregisteredError, invalidTokenError, invalidPayloadError :: Text
quotaError = "{\"error\":{\"status\":\"RESOURCE_EXHAUSTED\"}}"
unavailableError = "{\"error\":{\"status\":\"UNAVAILABLE\"}}"
unregisteredError = "{\"error\":{\"status\":\"UNREGISTERED\"}}"
invalidTokenError =
  "{\"error\":{\"status\":\"INVALID_ARGUMENT\",\"details\":[{\"@type\":\"type.googleapis.com/google.firebase.fcm.v1.FcmError\",\"errorCode\":\"INVALID_ARGUMENT\"}]}}"
invalidPayloadError =
  "{\"error\":{\"status\":\"INVALID_ARGUMENT\",\"details\":[{\"@type\":\"type.googleapis.com/google.rpc.BadRequest\"}]}}"
