const MOCK_DATA_ZH = {
  ingredientName: "本地Mock鲈鱼",
  ingredientDesc: "适合清蒸，注意去腥",
  taste: "鲜甜",
  texture: "肉质细嫩，蒜瓣肉",
  similar: "黑鱼",
  freshnessLevel: "新鲜",
  freshnessReason: "鱼眼清澈微凸，鱼身有光泽",
  recipes: {
    familiar: [
      {
        recipe_name: "家常清蒸鲈鱼",
        ingredients_needed: ["葱", "姜", "料酒", "蒸鱼豉油", "食用油"]
      }
    ],
    local: [
      {
        recipe_name: "当地红烧鲈鱼",
        ingredients_needed: ["葱", "姜", "蒜", "生抽", "老抽", "糖", "料酒"]
      }
    ]
  }
};

const MOCK_DATA_EN = {
  ingredientName: "Local Mock Sea Bass",
  ingredientDesc: "Suitable for steaming, remember to remove fishy smell",
  taste: "Fresh and sweet",
  texture: "Tender meat, flaky texture",
  similar: "Snakehead",
  freshness_level: "Fresh",
  freshness_reason: "Clear and slightly protruding eyes, shiny skin",
  recipes: {
    familiar: [
      {
        recipe_name: "Home-style Steamed Sea Bass",
        ingredients_needed: ["Scallion", "Ginger", "Cooking wine", "Steamed fish soy sauce", "Cooking oil"]
      }
    ],
    local: [
      {
        recipe_name: "Local Braised Sea Bass",
        ingredients_needed: ["Scallion", "Ginger", "Garlic", "Light soy sauce", "Dark soy sauce", "Sugar", "Cooking wine"]
      }
    ]
  }
};

module.exports = {
  MOCK_DATA_ZH,
  MOCK_DATA_EN
};
