{-# LANGUAGE DuplicateRecordFields #-}

module Base.Api.Handler.PushSubscriptions where

import Api.Push.Notifications (validatePushSubscription)
import Data.Time.Clock (getCurrentTime)
import Import

data PushSubscriptionBody = PushSubscriptionBody
  { token :: Text
  , locale :: Text
  }
  deriving stock (Generic)
  deriving anyclass (FromJSON)

newtype PushSubscriptionStatus = PushSubscriptionStatus {enabled :: Bool}
  deriving stock (Generic)
  deriving anyclass (ToJSON)

getApiV1PushSubscriptionsR :: Handler PushSubscriptionStatus
getApiV1PushSubscriptionsR = do
  userId <- getRequestUserId
  PushSubscriptionStatus . (> 0) <$> runDB (count [PushSubscriptionUserId ==. userId])

postApiV1PushSubscriptionsR :: Handler PushSubscriptionStatus
postApiV1PushSubscriptionsR = do
  userId <- getRequestUserId
  PushSubscriptionBody {..} <- requireCheckJsonBody
  either (invalidArgs . pure) pure $ validatePushSubscription token locale
  now <- liftIO getCurrentTime
  runDB
    $ void
    $ upsertBy
      (UniquePushSubscriptionToken token)
      (PushSubscription userId token locale now)
      [ PushSubscriptionUserId =. userId
      , PushSubscriptionLocale =. locale
      , PushSubscriptionRefreshedAt =. now
      ]
  pure $ PushSubscriptionStatus True

deleteApiV1PushSubscriptionsR :: Handler PushSubscriptionStatus
deleteApiV1PushSubscriptionsR = do
  userId <- getRequestUserId
  PushSubscriptionBody {..} <- requireCheckJsonBody
  either (invalidArgs . pure) pure $ validatePushSubscription token locale
  runDB $ deleteWhere [PushSubscriptionUserId ==. userId, PushSubscriptionFcmToken ==. token]
  pure $ PushSubscriptionStatus False
