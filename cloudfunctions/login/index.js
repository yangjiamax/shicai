exports.main = async (event, context) => {
  try {
    const wxContext = cloud.getWXContext();
    return {
      success: true,
      openid: wxContext.OPENID || null,
      appid: wxContext.APPID || null,
      unionid: wxContext.UNIONID || null
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || '获取用户信息失败'
    };
  }
};