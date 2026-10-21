module Arkham.Investigator.SkipFastOutsideTurnSpec (spec) where

import Arkham.Asset.Cards qualified as Assets
import Arkham.Classes.HasGame (getGame)
import Arkham.Investigator.Cards qualified as Investigators
import TestImport.New

{- | The sources of every ability currently offered to any seat.

A skipped fast ability is dropped from the window rather than answered, so the
specs have to look at the pending questions instead of choosing an option.
-}
offeredAbilitySources :: TestAppT [Source]
offeredAbilitySources = do
  questionMap <- gameQuestion <$> getGame
  pure
    [ ability.source
    | (_, question) <- mapToList questionMap
    , AbilityLabel {ability} <- choicesOf (stripQuestionWrappers question)
    ]
 where
  choicesOf = \case
    ChooseOne msgs -> msgs
    ChooseOneAtATime msgs -> msgs
    ChooseN _ msgs -> msgs
    PlayerWindowChooseOne msgs -> msgs
    _ -> []

{- | A second seat holding a Beat Cop (Fast. Discard: 1 damage to an enemy at your
location) with an enemy to use it on. The test investigator keeps the turn.
-}
seatWithBeatCop :: TestAppT (Investigator, AssetId)
seatWithBeatCop = do
  other <- addInvestigator Investigators.rolandBanks
  location <- testLocation
  run $ placedLocation location
  enemy <- testEnemy & prop @"health" 2
  enemy `spawnAt` location
  other `moveTo` location
  beatCop <- other `putAssetIntoPlay` Assets.beatCop
  pure (other, beatCop)

skipBeatCop :: Investigator -> Bool -> TestAppT ()
skipBeatCop who = run . SetCardSkipFastOutsideTurn (toId who) (toCardCode Assets.beatCop)

spec :: Spec
spec = describe "Skipping a card's fast abilities outside your turn" do
  context "when it is not the investigator's turn" do
    it "still offers the fast ability by default" . gameTest $ \_ -> do
      (other, beatCop) <- seatWithBeatCop
      inWindow other (pure ())
      offeredAbilitySources `shouldContainM` [toSource beatCop]

    it "drops the fast ability from a fast player window once set" . gameTest $ \_ -> do
      (other, beatCop) <- seatWithBeatCop
      skipBeatCop other True
      inWindow other (pure ())
      offeredAbilitySources `shouldNotContainM` [toSource beatCop]

    it "offers the fast ability again once unset" . gameTest $ \_ -> do
      (other, beatCop) <- seatWithBeatCop
      skipBeatCop other True
      skipBeatCop other False
      inWindow other (pure ())
      offeredAbilitySources `shouldContainM` [toSource beatCop]

    it "only skips the investigator who set it" . gameTest $ \self -> do
      (other, beatCop) <- seatWithBeatCop
      skipBeatCop self True
      inWindow other (pure ())
      offeredAbilitySources `shouldContainM` [toSource beatCop]

    -- The window a seat gets while someone else has the turn is built by its own
    -- handler rather than by the shared window runner.
    context "in the window a seat gets during another investigator's turn" do
      it "offers the fast ability by default" . gameTest $ \self -> do
        (_, beatCop) <- seatWithBeatCop
        run $ PlayerWindow (toId self) [] False False
        offeredAbilitySources `shouldContainM` [toSource beatCop]

      it "drops the fast ability once set" . gameTest $ \self -> do
        (other, beatCop) <- seatWithBeatCop
        skipBeatCop other True
        run $ PlayerWindow (toId self) [] False False
        offeredAbilitySources `shouldNotContainM` [toSource beatCop]

  context "on the investigator's own turn" do
    it "still offers the fast ability when set" . gameTest $ \self -> do
      location <- testLocation
      run $ placedLocation location
      enemy <- testEnemy & prop @"health" 2
      enemy `spawnAt` location
      self `moveTo` location
      beatCop <- self `putAssetIntoPlay` Assets.beatCop
      skipBeatCop self True
      inWindow self (pure ())
      offeredAbilitySources `shouldContainM` [toSource beatCop]
