const app = getApp();

Page({
  data: {
    result: null,
    selectedIndex: 0,
    selectedIngredients: [],
    importedListData: null
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

      let resultData;
      let importedListData = null;

      if (options.fromHistory === '1' || options.shared === '1') {
        importedListData = data;
        resultData = data.analysisResult;
        
        // 分享进来的场景，可能只有 cloudImagePath，确保 imagePath 有回退
        if (resultData && !resultData.imagePath && resultData.cloudImagePath) {
          resultData.imagePath = resultData.cloudImagePath;
        }
      } else {
        resultData = data;
      }
      
      if (!resultData) return;
      
      // 映射新鲜度状态为英文类名
      const levelMap = {
        '新鲜': 'fresh',
        '一般': 'normal',
        '不太新鲜': 'bad'
      };
      resultData.freshness_class = levelMap[resultData.freshness_level] || 'normal';

      // 预处理 recipes，增加 ingredients_summary 字段
      if (resultData.recipes && Array.isArray(resultData.recipes)) {
        resultData.recipes = resultData.recipes.map(recipe => {
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

      this.setData({ 
        result: resultData,
        importedListData: importedListData
      });

      let initialIndex = 0;
      if (importedListData && importedListData.recipeName && resultData.recipes) {
        const foundIndex = resultData.recipes.findIndex(r => r.recipe_name === importedListData.recipeName);
        if (foundIndex !== -1) {
          initialIndex = foundIndex;
        }
      }
      this.updateSelectedIngredients(initialIndex);
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

  previewImage() {
    if (this.data.result && this.data.result.imagePath) {
      wx.previewImage({
        urls: [this.data.result.imagePath],
        current: this.data.result.imagePath
      });
    }
  },

  generateList() {
    const result = this.data.result;
    const selectedRecipe = result.recipes[this.data.selectedIndex];
    
    let listData;
    if (this.data.importedListData && this.data.importedListData.recipeName === selectedRecipe.recipe_name) {
      listData = this.data.importedListData;
    } else {
      listData = {
        ingredientName: result.ingredient_name,
        recipeName: selectedRecipe.recipe_name,
        ingredients: this.data.selectedIngredients.map(name => ({
          name: name,
          checked: false
        })),
        analysisResult: result
      };
    }

    wx.navigateTo({
      url: `/pages/list/index?data=${encodeURIComponent(JSON.stringify(listData))}`
    });
  },

  retry() {
    const pages = getCurrentPages();
    const isFromHistoryOrShare = this.data.importedListData !== null;

    if (isFromHistoryOrShare) {
      wx.reLaunch({
        url: '/pages/index/index'
      });
    } else {
      if (pages.length > 1) {
        wx.navigateBack();
      } else {
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    }
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  }
});