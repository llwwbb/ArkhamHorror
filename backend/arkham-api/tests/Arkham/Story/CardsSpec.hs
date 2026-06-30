module Arkham.Story.CardsSpec (spec) where

import Arkham.Story.Cards qualified as Stories
import TestImport qualified as TI
import TestImport.New

spec :: Spec
spec = describe "Story card definitions" do
  it "does not derive missing art for printed story backs" do
    map (.otherSide)
      [ Stories.engramsOath
      , Stories.songsThatTheHyadesShallSing
      , Stories.starsOfAldebaran
      , Stories.bleakDesolation
      , Stories.inhabitantOfCarcosa
      , Stories.aMomentsRest
      , Stories.theCoffin
      , Stories.mappingTheStreets
      , Stories.theKingsParade
      , Stories.theArchway
      , Stories.theHeightOfTheDepths
      , Stories.stepsOfThePalace
      ]
      `TI.shouldBe` map
        Just
        [ "03076b"
        , "03325b"
        , "03326b"
        , "03326d"
        , "03327b"
        , "03327d"
        , "03327f"
        , "03328b"
        , "03328d"
        , "03328f"
        , "03329b"
        , "03329d"
        ]
