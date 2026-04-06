// 云函数入口文件
const cloud = require('wx-server-sdk')
const axios = require('axios')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境

// 云函数入口函数
exports.main = async (event, context) => {
  const { latitude, longitude } = event

  if (!latitude || !longitude) {
    return {
      code: -1,
      msg: '缺少经纬度参数'
    }
  }

  // 从云函数环境变量获取 Key，强制使用环境变量以保证安全性
  const TENCENT_MAP_KEY = process.env.TENCENT_MAP_KEY
  
  if (!TENCENT_MAP_KEY) {
    return {
      code: -1,
      msg: '未配置腾讯位置服务 TENCENT_MAP_KEY 环境变量'
    }
  }

  try {
    const url = 'https://apis.map.qq.com/ws/geocoder/v1/'
    const response = await axios.get(url, {
      params: {
        location: `${latitude},${longitude}`,
        key: TENCENT_MAP_KEY,
        get_poi: 0
      }
    })

    const data = response.data

    if (data && data.status === 0) {
      const adInfo = data.result.ad_info
      return {
        code: 0,
        data: {
          lat: latitude,
          lng: longitude,
          nation: adInfo.nation,
          city: adInfo.city,
          province: adInfo.province
        }
      }
    } else {
      console.error('腾讯位置服务接口返回错误:', data)
      return {
        code: data.status,
        msg: data.message || '位置解析失败'
      }
    }
  } catch (error) {
    console.error('请求腾讯位置服务失败:', error)
    return {
      code: -2,
      msg: '请求逆地址解析接口异常'
    }
  }
}
