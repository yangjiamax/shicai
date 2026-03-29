const app = getApp();

Page({
  data: {
    result: null,
    selectedIndex: 0,
    selectedIngredients: []
  },

  onLoad(options) {
    if (options.data) {
      let data;
      try {
        data = JSON.parse(decodeURIComponent(options.data));
      } catch (e) {
        console.error('Failed to parse result data', e);
        return;
      }
      
      // 映射新鲜度状态为英文类名
      const levelMap = {
        '新鲜': 'fresh',
        '一般': 'normal',
        '不太新鲜': 'bad'
      };
      data.freshness_class = levelMap[data.freshness_level] || 'normal';

      // 预处理 recipes，增加 ingredients_summary 字段
      if (data.recipes && Array.isArray(data.recipes)) {
        data.recipes = data.recipes.map(recipe => {
          if (recipe.ingredients_needed && Array.isArray(recipe.ingredients_needed)) {
            const top3 = recipe.ingredients_needed.slice(0, 3).join('、');
            const suffix = recipe.ingredients_needed.length > 3 ? '等' : '';
            recipe.ingredients_summary = top3 + suffix;
          } else {
            recipe.ingredients_summary = '';
          }
          return recipe;
        });
      }

      this.setData({ result: data });
      this.updateSelectedIngredients(0);
    }
  },

  updateSelectedIngredients(index) {
    const result = this.data.result;
    if (result && result.recipes && result.recipes[index]) {
      this.setData({
        selectedIndex: index,
        selectedIngredients: result.recipes[index].ingredients_needed
      });
    }
  },

  selectRecipe(e) {
    const index = e.currentTarget.dataset.index;
    this.updateSelectedIngredients(index);
  },

  generateList() {
    const result = this.data.result;
    const selectedRecipe = result.recipes[this.data.selectedIndex];
    
    const listData = {
      ingredientName: result.ingredient_name,
      recipeName: selectedRecipe.recipe_name,
      ingredients: this.data.selectedIngredients.map(name => ({
        name: name,
        checked: false
      }))
    };

    wx.navigateTo({
      url: `/pages/list/index?data=${encodeURIComponent(JSON.stringify(listData))}`
    });
  },

  retry() {
    wx.navigateBack();
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  }
});