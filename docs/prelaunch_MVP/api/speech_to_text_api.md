**大模型录音文件极速版识别API**

<br />

## **接口简介 [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E6%8E%A5%E5%8F%A3%E7%AE%80%E4%BB%8B)**

本接口适用于 **录音文件极速识别场景**，基于大模型能力提供识别效果更佳、返回更快的体验。调用形式为 **一次请求即返回识别结果**，无需 submit/query 轮询。

<br />

## **使用限制 [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E4%BD%BF%E7%94%A8%E9%99%90%E5%88%B6)**

**项目**

**限制说明**

音频时长

不超过 2h，时长超过2小时的文件请使用录音文件识别标准版

音频大小

不超过 100MB

音频格式

支持 WAV / MP3/OGG OPUS

资源 ID

需开通 `volc.bigasr.auc_turbo` 权限

上传文件二进制流

大小尽量20M以内，取决于客户本身出口带宽

多声道

相比于单声道，处理时长会相应增长

<br />

## **接口地址 [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E6%8E%A5%E5%8F%A3%E5%9C%B0%E5%9D%80)**

```
POST https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash

```

<br />

## **请求 Header [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E8%AF%B7%E6%B1%82-header)**

旧版本控制台

**Key**

**说明**

**Value 示例**

X-Api-App-Key

使用火山引擎控制台获取的APP ID，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)（旧版控制台使用，新版控制台只需要X-Api-Key即可）

123456789

X-Api-Access-Key

使用火山引擎控制台获取的Access Token，可参考 [控制台使用FAQ-Q1](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)（旧版控制台使用，新版控制台只需要X-Api-Key即可）

your-access-key

X-Api-Resource-Id

表示调用服务的资源信息 ID，固定值volc.bigasr.auc\_turbo

volc.bigasr.auc\_turbo

X-Api-Request-Id

用于提交和查询任务的任务ID，推荐传入随机生成的UUID

67ee89ba-7050-4c04-a3d7-ac61a63499b3

X-Api-Sequence

发包序号，固定值，-1

<br />

```
headers = {
    "X-Api-App-Key": appid,
    "X-Api-Access-Key": token,
    "X-Api-Resource-Id": "volc.bigasr.auc_turbo",//资源ID
    "X-Api-Request-Id": task_id,
    "X-Api-Sequence": "-1"

```

新版本控制台

**Key**

**说明**

**Value 示例**

X-Api-Key

使用火山引擎控制台获取的APP Key，可参考 [快速入门（新版控制台）](https://www.volcengine.com/docs/6561/196768#q1%EF%BC%9A%E5%93%AA%E9%87%8C%E5%8F%AF%E4%BB%A5%E8%8E%B7%E5%8F%96%E5%88%B0%E4%BB%A5%E4%B8%8B%E5%8F%82%E6%95%B0appid%EF%BC%8Ccluster%EF%BC%8Ctoken%EF%BC%8Cauthorization-type%EF%BC%8Csecret-key-%EF%BC%9F)

123456789

X-Api-Resource-Id

表示调用服务的资源信息 ID，固定值volc.bigasr.auc\_turbo

volc.bigasr.auc\_turbo

X-Api-Request-Id

用于提交和查询任务的任务ID，推荐传入随机生成的UUID

67ee89ba-7050-4c04-a3d7-ac61a63499b3

X-Api-Sequence

发包序号，固定值，-1

<br />

```
headers = {
    "X-Api-Key": apikey,
    "X-Api-Resource-Id": "volc.bigasr.auc_turbo",//资源ID
    "X-Api-Request-Id": task_id,
    "X-Api-Sequence": "-1"
}

```

<br />

### **[#](https://www.volcengine.com/docs/6561/1631584?lang=zh#)**

<br />

## **请求体格式（Body） [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E8%AF%B7%E6%B1%82%E4%BD%93%E6%A0%BC%E5%BC%8F%EF%BC%88body%EF%BC%89)**

```
{
  "user": {
    "uid": "你的AppKey"
  },
  "audio": {
    "url": "https://example.com/audio.wav"
    // 或
    "data": "base64编码音频内容"
  },
  "request": {
    "model_name": "bigmodel"
  }
}

```

> 注：`audio.url` 与 `audio.data` 二选一

**请求字段同录音文件标准版本，移除callback，callback\_data，客服能力(enable\_lid，enable\_emotion\_detection，enable\_gender\_detection，show\_volume，show\_speech\_rate)字段**

<br />

## **返回格式（成功） [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E8%BF%94%E5%9B%9E%E6%A0%BC%E5%BC%8F%EF%BC%88%E6%88%90%E5%8A%9F%EF%BC%89)**

<br />

### **响应头 [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E5%93%8D%E5%BA%94%E5%A4%B4)**

服务端返回的 logid，建议用户获取和打印方便定位问题

```
recognize task response header X-Api-Status-Code: 20000000
recognize task response header X-Api-Message: OK
Thu Jun 19 19:43:55 2025 recognize task response header X-Tt-Logid: 202506191943547B30C313640AF5B35A86

```

<br />

### **响应体 [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E5%93%8D%E5%BA%94%E4%BD%93)**

```
{
  "audio_info": {
    "duration": 2499
  },
  "result": {
    "additions": {
      "duration": "2499"
    },
    "text": "关闭透传。",
    "utterances": [
      {
        "end_time": 1530,
        "start_time": 450,
        "text": "关闭透传。",
        "words": [
          {
            "confidence": 0,
            "end_time": 770,
            "start_time": 450,
            "text": "关"
          },
          {
            "confidence": 0,
            "end_time": 970,
            "start_time": 770,
            "text": "闭"
          },
          {
            "confidence": 0,
            "end_time": 1210,
            "start_time": 1130,
            "text": "透"
          },
          {
            "confidence": 0,
            "end_time": 1530,
            "start_time": 1490,
            "text": "传"
          }
        ]
      }
    ]
  }
}

```

<br />

## **错误码 [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#%E9%94%99%E8%AF%AF%E7%A0%81)**

**错误码**

**含义**

**说明**

20000000

成功

<br />

20000003

静音音频

<br />

45000001

请求参数无效

请求参数缺失必需字段 / 字段值无效

45000002

空音频

<br />

45000151

音频格式不正确

<br />

550XXXX

服务内部处理错误

<br />

55000031

服务器繁忙

服务过载，无法处理当前请求。

<br />

## **Demo [#](https://www.volcengine.com/docs/6561/1631584?lang=zh#demo)**

```
import json
import time
import uuid
import requests
import base64

# 辅助函数：下载文件
def download_file(file_url):
    response = requests.get(file_url)
    if response.status_code == 200:
        return response.content  # 返回文件内容（二进制）
    else:
        raise Exception(f"下载失败，HTTP状态码: {response.status_code}")

# 辅助函数：将本地文件转换为Base64
def file_to_base64(file_path):
    with open(file_path, 'rb') as file:
        file_data = file.read()  # 读取文件内容
        base64_data = base64.b64encode(file_data).decode('utf-8')  # Base64 编码
    return base64_data

# recognize_task 函数
def recognize_task(file_url=None, file_path=None):
    recognize_url = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash"
    # 填入控制台获取的appKey
    # 注意事项: 新版控制台只需要 app_key 即可,不需要 access_key;老版本控制台都需要
    appKey = "{你的appKey}"
    accessKey = "{你的accessKey}"
        
    headers = {
        "X-Api-App-Key": appKey,
        "X-Api-Access-Key": accessKey,
        "X-Api-Resource-Id": "volc.bigasr.auc_turbo", 
        "X-Api-Request-Id": str(uuid.uuid4()),
        "X-Api-Sequence": "-1", 
    }

    # 检查是使用文件URL还是直接上传数据
    audio_data = None
    if file_url:
        audio_data = {"url": file_url}
    elif file_path:
        base64_data = file_to_base64(file_path)  # 转换文件为 Base64
        audio_data = {"data": base64_data}  # 使用Base64编码后的数据

    if not audio_data:
        raise ValueError("必须提供 file_url 或 file_path 其中之一")

    request = {
        "user": {
            "uid": appKey
        },
        "audio": audio_data,
        "request": {
            "model_name": "bigmodel",
            # "enable_itn": True,
            # "enable_punc": True,
            # "enable_ddc": True,
            # "enable_speaker_info": False,

        },
    }

    response = requests.post(recognize_url, json=request, headers=headers)
    if 'X-Api-Status-Code' in response.headers:
        print(f'recognize task response header X-Api-Status-Code: {response.headers["X-Api-Status-Code"]}')
        print(f'recognize task response header X-Api-Message: {response.headers["X-Api-Message"]}')
        print(time.asctime() + " recognize task response header X-Tt-Logid: {}".format(response.headers["X-Tt-Logid"]))
        print(f'recognize task response content is: {response.json()}\n')
    else:
        print(f'recognize task failed and the response headers are:: {response.headers}\n')
        exit(1)
    return response

# recognizeMode 不变
def recognizeMode(file_url=None, file_path=None):
    start_time = time.time()
    print(time.asctime() + " START!")
    recognize_response = recognize_task(file_url=file_url, file_path=file_path)
    code = recognize_response.headers['X-Api-Status-Code']
    logid = recognize_response.headers['X-Tt-Logid']
    if code == '20000000':  # task finished
        f = open("result.json", mode='w', encoding='utf-8')
        f.write(json.dumps(recognize_response.json(), indent=4, ensure_ascii=False))
        f.close()
        print(time.asctime() + " SUCCESS! \n")
        print(f"程序运行耗时: {time.time() - start_time:.6f} 秒")
    elif code != '20000001' and code != '20000002':  # task failed
        print(time.asctime() + " FAILED! code: {}, logid: {}".format(code, logid))
        print("headers:")
        # print(query_response.content)

def main(): 
    # 示例：通过 URL 或 文件路径选择传入参数
    file_url = "https://example.mp3"
    file_path = "audio/example.mp3"  # 如果你有本地文件，可以选择这个 
    recognizeMode(file_url=file_url)  # 或者 recognizeMode(file_path=file_path)
    # recognizeMode(file_path=file_path)  # 或者 recognizeMode(file_path=file_path)
 
if __name__ == '__main__': 
    main()

```

<br />

## **[#](https://www.volcengine.com/docs/6561/1631584?lang=zh#-2)**
