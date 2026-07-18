{-# LANGUAGE QuasiQuotes #-}
{-# LANGUAGE TemplateHaskell #-}
{-# LANGUAGE UndecidableInstances #-}

module Entity.PushNotificationOutbox where

import Data.Aeson (Value)
import Data.Time.Clock
import Data.UUID (UUID)
import Database.Persist.TH
import Entity
import Entity.Arkham.Game
import Entity.User
import Orphans ()
import Relude

mkEntity
  $(discoverEntities)
  [persistLowerCase|
PushNotificationOutbox sql=push_notification_outbox
  Id UUID default=uuid_generate_v4()
  userId UserId OnDeleteCascade
  arkhamGameId ArkhamGameId OnDeleteCascade
  gameStep Int
  kind Text
  payload Value
  status Text
  attempts Int
  nextAttemptAt UTCTime
  createdAt UTCTime
  sentAt UTCTime Maybe
  lastError Text Maybe
  UniquePushNotification arkhamGameId gameStep userId kind
  deriving Generic Show
|]
