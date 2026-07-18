{-# LANGUAGE QuasiQuotes #-}
{-# LANGUAGE TemplateHaskell #-}
{-# LANGUAGE UndecidableInstances #-}

module Entity.PushSubscription where

import Data.Time.Clock
import Data.UUID (UUID)
import Database.Persist.TH
import Entity
import Entity.User
import Orphans ()
import Relude

mkEntity
  $(discoverEntities)
  [persistLowerCase|
PushSubscription sql=push_subscriptions
  Id UUID default=uuid_generate_v4()
  userId UserId OnDeleteCascade
  fcmToken Text
  locale Text
  refreshedAt UTCTime
  UniquePushSubscriptionToken fcmToken
  deriving Generic Show
|]
