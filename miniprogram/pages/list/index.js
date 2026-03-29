const app = getApp();

Page({
  data: {
    listData: null,
    shareTitle: ''
  },

  onLoad(options) {
    if (options.data) {
      const data = JSON.parse(decodeURIComponent(options.data));
      this.setData({ 
        listData: data,
        shareTitle: `${data.ingredientName} - ${data.recipeName} 佐料`
      });
    }
  },

  toggleIngredient(e) {
    const index = e.currentTarget.dataset.index;
    const ingredients = this.data.listData.ingredients;
    ingredients[index].checked = !ingredients[index].checked;
    this.setData({ 'listData.ingredients': ingredients });
  },

  onShareAppMessage() {
    const data = this.data.listData;
    const checkedItems = data.ingredients.filter(i => i.checked).map(i => i.name);
    
    return {
      title: `${data.ingredientName} ${data.recipeName} 佐料清单`,
      desc: `需要：${checkedItems.join('、')}`,
      path: `/pages/index/index`
    };
  },

  retry() {
    wx.reLaunch({
      url: '/pages/index/index'
    });
  },

  clearData() {
    wx.showModal({
      title: '清除数据',
      content: '确定清除本地数据并退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const auth = require('../../utils/auth.js');
          auth.logout();
        }
      }
    });
  }
});