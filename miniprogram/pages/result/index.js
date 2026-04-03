const app = getApp();
const analyzeUtil = require('../../utils/analyze.js');

Page({
  data: {
    result: null,
    showTabs: false,
    activeTab: 'familiar',
    displayRecipes: [],
    selectedIndex: 0,
    selectedIngredients: [],
    importedListData: null,
    i18n: {},
    loadingFamiliar: false,
    loadingLocal: false,
    errorFamiliar: false,
    errorLocal: false,
    
    // Custom Modal State
    showSuccessModal: false,
    
    // Tutorial Sheet State
    showTutorialSheet: false,
    tutorialLoading: false,
    tutorialError: false,
    tutorialErrorMsg: '',
    tutorials: [],
    currentTutorialKeyword: ''
  },

  onLoad(options) {
    this.setData({ i18n: app.globalData.i18n });
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
      let isFromHistoryOrShare = false;

      if (options.fromHistory === '1' || options.shared === '1') {
        isFromHistoryOrShare = true;
        importedListData = data;
        resultData = data.analysisResult;
        
        // 历史记录或分享进来的场景，优先使用 cloudImagePath 避免本地临时文件过期
        if (resultData && resultData.cloudImagePath) {
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
        '不太新鲜': 'bad',
        'Fresh': 'fresh',
        'Average': 'normal',
        'Not fresh': 'bad',
        'Not Fresh': 'bad'
      };
      resultData.freshness_class = levelMap[resultData.freshness_level] || 'normal';

      // 初始化 recipes 结构（如果是第一步刚进来，recipes 会是 undefined）
      if (!resultData.recipes || typeof resultData.recipes !== 'object') {
        resultData.recipes = { familiar: [], local: [] };
      }

      this.setData({ 
        result: resultData,
        importedListData: importedListData
      });

      // 如果是从首页新拍摄进来的，触发渐进式请求
      const hasFamiliarRecipes = resultData.recipes && resultData.recipes.familiar && resultData.recipes.familiar.length > 0;
      if (!isFromHistoryOrShare && !hasFamiliarRecipes && resultData.ingredient_name) {
        const nationality = options.nationality ? decodeURIComponent(options.nationality) : '';
        let location = null;
        try {
          if (options.location) location = JSON.parse(decodeURIComponent(options.location));
        } catch(e) {}
        
        this.fetchExtraData(resultData.ingredient_name, nationality, location);
      } else {
        // 如果是历史记录，直接处理已有的完整数据
        this.processRecipesData();
      }
    }
  },

  async fetchExtraData(ingredientName, nationality, location) {
    this.setData({ 
      loadingFamiliar: true, 
      errorFamiliar: false,
      loadingLocal: true,
      errorLocal: false
    });

    // 1. 并行请求熟悉味道 (Familiar)
    const fetchFamiliar = async () => {
      try {
        const familiarRes = await analyzeUtil.analyzeFamiliar(ingredientName, nationality);
        let currentResult = this.data.result;
        currentResult.recipes.familiar = familiarRes.recipes_familiar || [];
        
        this.setData({ 
          result: currentResult,
          loadingFamiliar: false
        }, () => {
          this.processRecipesData();
        });
      } catch (err) {
        console.error('Fetch familiar data failed:', err);
        this.setData({ loadingFamiliar: false, errorFamiliar: true });
      }
    };

    // 2. 并行请求当地做法 (Local)
    const fetchLocal = async () => {
      try {
        const localRes = await analyzeUtil.analyzeLocal(ingredientName, location);
        let currentResult = this.data.result;
        currentResult.recipes.local = localRes.recipes_local || [];
        
        this.setData({ 
          result: currentResult,
          loadingLocal: false
        }, () => {
          this.processRecipesData();
        });
      } catch (err) {
        console.error('Fetch local data failed:', err);
        this.setData({ loadingLocal: false, errorLocal: true });
      }
    };

    // 同时发起两个请求，互不阻塞
    fetchFamiliar();
    fetchLocal();
  },

  processRecipesData() {
    let resultData = this.data.result;
    let importedListData = this.data.importedListData;

    // 预处理 recipes，增加 ingredients_summary 字段
    const processRecipesArray = (recipesArray) => {
      if (!recipesArray || !Array.isArray(recipesArray)) return [];
      return recipesArray.map(recipe => {
        if (recipe.ingredients_needed && Array.isArray(recipe.ingredients_needed)) {
          const separator = app.globalData.language === 'en' ? ', ' : '、';
          const top3 = recipe.ingredients_needed.slice(0, 3).join(separator);
          const suffix = recipe.ingredients_needed.length > 3 ? app.t('res_etc') : '';
          recipe.ingredients_summary = top3 + suffix;
        } else {
          recipe.ingredients_summary = '';
        }
        return recipe;
      });
    };

    resultData.recipes.familiar = processRecipesArray(resultData.recipes.familiar);
    resultData.recipes.local = processRecipesArray(resultData.recipes.local);

    const hasLocal = resultData.recipes.local && resultData.recipes.local.length > 0;
    const hasFamiliar = resultData.recipes.familiar && resultData.recipes.familiar.length > 0;
    
    // 如果都没有，可能还在加载中
    const showTabs = hasLocal; 
    const activeTab = this.data.activeTab;
    const displayRecipes = resultData.recipes[activeTab] || [];

    this.setData({ 
      result: resultData,
      showTabs: showTabs,
      displayRecipes: displayRecipes
    });

    let initialIndex = 0;
    if (importedListData && importedListData.recipeName && displayRecipes) {
      const foundIndex = displayRecipes.findIndex(r => r.recipe_name === importedListData.recipeName);
      if (foundIndex !== -1) {
        initialIndex = foundIndex;
      } else if (showTabs && resultData.recipes.local) {
        const foundLocalIndex = resultData.recipes.local.findIndex(r => r.recipe_name === importedListData.recipeName);
        if (foundLocalIndex !== -1) {
          this.setData({
            activeTab: 'local',
            displayRecipes: resultData.recipes.local
          });
          initialIndex = foundLocalIndex;
        }
      }
    }
    this.updateSelectedIngredients(initialIndex);
  },

  onShow() {
    this.setData({ i18n: app.globalData.i18n });
    wx.setNavigationBarTitle({ title: app.t('page_title_result') });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.activeTab === tab) return;

    const displayRecipes = this.data.result.recipes[tab] || [];
    this.setData({
      activeTab: tab,
      displayRecipes: displayRecipes,
      selectedIndex: 0,
      selectedIngredients: displayRecipes.length > 0 ? displayRecipes[0].ingredients_needed : []
    });
  },

  updateSelectedIngredients(index) {
    const displayRecipes = this.data.displayRecipes;
    if (displayRecipes && displayRecipes[index]) {
      this.setData({
        selectedIndex: index,
        selectedIngredients: displayRecipes[index].ingredients_needed
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

  async generateList() {
    const result = this.data.result;
    const selectedRecipe = this.data.displayRecipes[this.data.selectedIndex];
    const dbUtil = require('../../utils/db.js');
    
    wx.showLoading({ title: '正在加入...', mask: true });
    
    try {
      // 1. 获取今日活跃清单 ID
      const listId = await dbUtil.getActiveList();
      
      // 2. 格式化 Ingredient 对象
      const ingredients = this.data.selectedIngredients.map(name => ({
        name: name,
        standard_name: name,
        category: '其他', // 默认分类
        source_recipe: selectedRecipe.recipe_name
      }));
      
      // 3. 写入活跃清单
      await dbUtil.addIngredientsToList(listId, ingredients);
      
      // 4. 记录到“集邮”历史 (histories 集合)
      try {
        const db = wx.cloud.database();
        await db.collection('histories').add({
          data: {
            ingredient_name: result.ingredient_name,
            selected_recipe: {
              recipe_name: selectedRecipe.recipe_name,
              ingredients_needed: selectedRecipe.ingredients_needed
            },
            analysisResult: result,
            createdAt: db.serverDate()
          }
        });
      } catch (historyErr) {
        console.error('保存集邮历史失败:', historyErr);
        // 不阻塞主流程
      }
      
      wx.hideLoading();
      
      // 5. 交互优化：弹出提示
      wx.showToast({
        title: '已加入清单',
        icon: 'success',
        duration: 2000
      });
      
      setTimeout(() => {
        this.setData({
          showSuccessModal: true
        });
      }, 500);
    } catch (err) {
      console.error('加入清单失败:', err);
      wx.hideLoading();
      wx.showToast({
        title: '加入失败',
        icon: 'none'
      });
    }
  },

  modalContinue() {
    this.setData({ showSuccessModal: false });
    wx.reLaunch({
      url: '/pages/index/index'
    });
  },

  modalViewList() {
    this.setData({ showSuccessModal: false });
    wx.switchTab({
      url: '/pages/list/index'
    });
  },

  modalClose() {
    this.setData({ showSuccessModal: false });
  },

  preventTouchMove() {
    // Prevent scrolling when modal is open
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