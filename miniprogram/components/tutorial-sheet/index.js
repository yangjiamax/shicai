const app = getApp();

Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    visible: Boolean,
    keyword: String,
    platform: {
      type: String,
      value: 'bilibili'
    }
  },

  data: {
    loading: false,
    error: false,
    errorMsg: '',
    tutorials: [],
    i18n: {}
  },

  observers: {
    'visible, keyword, platform': function(visible, keyword, platform) {
      if (visible && keyword) {
        this.setData({ i18n: app.globalData.i18n });
        this.fetchTutorials(keyword, platform);
      } else if (!visible) {
        this.setData({ tutorials: [], loading: false, error: false, errorMsg: '' });
      }
    }
  },

  methods: {
    async fetchTutorials(keyword, platform) {
      this.setData({ loading: true, error: false, errorMsg: '', tutorials: [] });

      try {
        const res = await wx.cloud.callFunction({
          name: 'analyze',
          data: {
            action: 'search_tutorial',
            keyword: keyword,
            lang: app.globalData.language
          }
        });

        if (!this.__isComponentAlive) return;

        if (res.result && !res.result.error && res.result.data) {
          const results = res.result.data[platform];
          if (results && results.length > 0) {
            this.setData({ loading: false, tutorials: results });
            return;
          } else {
            throw new Error('Empty response for ' + platform);
          }
        } else {
          throw new Error(res.result?.message || 'Empty response');
        }
      } catch (err) {
        console.error('[TutorialSheet] Fetch failed:', err);
        if (!this.__isComponentAlive) return;
        this.setData({
          loading: false,
          error: true,
          errorMsg: this.data.i18n?.err_cloud_func || 'Request failed'
        });
      }
    },

    retryTutorial() {
      this.fetchTutorials(this.data.keyword, this.data.platform);
    },

    closeSheet() {
      this.triggerEvent('close');
    },

    openTutorialLink(e) {
      const url = e.currentTarget.dataset.url;
      if (!url) return;

      wx.setClipboardData({
        data: url,
        success: () => {
          wx.showToast({
            title: this.data.i18n?.tutorial_copy_success || 'Copied',
            icon: 'none',
            duration: 3000
          });
        },
        fail: () => {
          wx.showToast({
            title: this.data.i18n?.tutorial_copy_fail || 'Copy failed',
            icon: 'none'
          });
        }
      });
    }
  },

  lifetimes: {
    attached() {
      this.__isComponentAlive = true;
    },
    detached() {
      this.__isComponentAlive = false;
    }
  }
});
