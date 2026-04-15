function makeDefaultListTitle(i18n, now = new Date()) {
  const mm = String(now.getMonth() + 1);
  const dd = String(now.getDate());
  const hour = now.getHours();
  
  let timePrefixKey = 'my_time_evening';
  if (hour >= 5 && hour < 12) {
    timePrefixKey = 'my_time_morning';
  } else if (hour >= 12 && hour < 18) {
    timePrefixKey = 'my_time_noon';
  }
  
  let timePrefix = '晚上';
  let titleTemplate = '{mm}月{dd}日{timePrefix}的采购单';

  if (i18n) {
    timePrefix = i18n[timePrefixKey] || (hour >= 5 && hour < 12 ? '早上' : (hour >= 12 && hour < 18 ? '中午' : '晚上'));
    titleTemplate = i18n['my_shopping_list_title'] || titleTemplate;
  } else {
    if (hour >= 5 && hour < 12) timePrefix = '早上';
    else if (hour >= 12 && hour < 18) timePrefix = '中午';
  }

  return titleTemplate
    .replace('{mm}', mm)
    .replace('{dd}', dd)
    .replace('{timePrefix}', timePrefix);
}

module.exports = {
  makeDefaultListTitle
};
