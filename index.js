import fs from "fs";
import fetch from "node-fetch";
import HttpsProxyAgent from "https-proxy-agent";
import Slack from "@slack/bolt";
import OpenAI from 'openai';
const { App } = Slack;

const settings = JSON.parse(fs.readFileSync("settings.json"));

const proxy = settings.proxy || process.env.https_proxy;

import { randomUUID } from "crypto";

async function chatgptRequest(messages, image_paths) {

    // 画像が存在する場合の処理
    console.log("this is request methosd")
    if (image_paths.length > 0){
        const message = [{
            "role": "user",
            "content": [{
                "type": "text", 
                "text": `${messages}`
            }]
        }]
    
        for (let i=0; i<image_paths.length; i++){
            const imageBuffer = fs.readFileSync(image_paths[i]);
            const base64Image = imageBuffer.toString('base64');
            message[0].content.push({
                "type":"image",
                "image":base64Image
            });
        }    
      
        const payload = {
            model: settings.openai.image_model,
            max_tokens: settings.openai.max_tokens,
            temperature: settings.openai.temperature,
            messages:message
        }

        console.log("payload", payload)
    
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${settings.openai.api_key}`,
                "Content-type": "application/json",
            },
            body: JSON.stringify(payload),
            agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
        });

        console.log('res', res)
      
        if (!res.ok) {
            const errmsg = await res.json();
            throw new Error(errmsg?.error?.message);
        }

        return await res.json();
    
    // 画像が存在しない場合の処理 
    }else{
        // const payload = {
        //     model: settings.openai.normal_model,
        //     max_tokens: settings.openai.max_tokens,
        //     temperature: settings.openai.temperature,
        //     messages,
        // };

        // console.log("payload", payload)

        // const payload = {
        //     prompt: "Hello",
        //     max_tokens: 100
        // }

        // console.log("api key", settings.openai.api_key)

        // const res = await fetch("https://api.openai.com/v1/chat/completions", {
        //     method: "POST",
        //     headers: {
        //     "Authorization": `Bearer ${settings.openai.api_key}`,
        //     "Content-Type": "application/json",
        //     },
        //     body: JSON.stringify(payload)
        //     // agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
        // }).then(res => console.log("res", res));

        // if (!res.ok) {
        //     const errmsg = await res.json();
        //     console.log("error message", errmsg)
        //     throw new Error(errmsg?.error?.message);
        // }

        // return await res.json();


        const openai = new OpenAI({
            apiKey: settings.openai.api_key
        });

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages,
        }).then(res => {
            return res
        });

        console.log("completion", completion);

        return completion;
    }
}



function saveSettings() {
  fs.writeFileSync("settings.json", JSON.stringify(settings, null, 4));
}

function addSettings(type, arg) {
  switch (type) {
    case "system_role":
      settings.openai.system_roles.push({
        role: "system",
        content: arg[0],
      });
      break;
    case "admin":
      if (settings.admin.includes(arg[0]))
        throw new Error("This user already admin");
      settings.admin.push(arg[0]);
      break;
    default:
      throw new Error("type not found");
  }

  saveSettings();
}

function removeSettings(type, arg) {
  switch (type) {
    case "system_role":
      if (settings.openai.system_roles[Number(arg[0])]) {
        settings.openai.system_roles.splice(Number(arg[0]), 1);
      } else {
        throw new Error("selected system role not found");
      }
      break;
    case "admin":
      if (settings.admin.includes(arg[0])) {
        settings.admin = settings.admin.filter((user) => !user.match(arg[0]));
      } else {
        throw new Error("selected user not found");
      }
      break;
    default:
      throw new Error("type not found");
  }

  saveSettings();
}

function updateSettings(type, arg) {
  switch (type) {
    case "openai_api_key":
    case "model":
      settings.openai[type] = arg[0];
      break;
    case "max_tokens":
    case "temperature":
      settings.openai[type] = Number(arg[0]);
      break;
    case "system_role":
      if (settings.openai.system_roles[Number(arg[0])]) {
        settings.openai.system_roles[Number(arg[0])].content = arg[1];
      } else {
        throw new Error("selected system role not found");
      }
      break;
    default:
      throw new Error("type not found");
  }

  saveSettings();
}

function help(type) {
  const descriptions = {
    add: "Add admin user or system role",
    remove: "Remove admin user or system role",
    update: "Update settings",
    get: "Get currently settings.json",
    reload_settings: "Reload ChatGPT-Bot settings",
  };
  let text;
  switch (type) {
    case "add":
      text = [
        descriptions[type],
        "/chatgpt add {subcommand} {value}",
        "",
        "admin: Add admin user",
        "system_role: Add system role",
      ].join("\n");
      break;
    case "remove":
      text = [
        descriptions[type],
        "/chatgpt remove {subcommand} {value}",
        "",
        "admin: Remove admin user",
        "system_role: Remove system role",
      ].join("\n");
      break;
    case "update":
      text = [
        descriptions[type],
        "/chatgpt update {subcommand} {value}",
        "",
        "openai_api_key: Update OpenAPI key to use",
        "model: Update model to use",
        "max_tokens: Update max tokens setting",
        "temperature: Update temperature setting",
        "system_role: Update system role setting",
      ].join("\n");
      break;
    case "get":
      text = descriptions[type];
      break;
    case "reload_settings":
      text = descriptions[type];
      break;
    default:
      text = Object.keys(descriptions)
        .map((key) => `${key}: ${descriptions[key]}`)
        .join("\n");
  }
  return text;
}

async function getFileInfo(fileId) {
    try {
        const response = await fetch(`https://slack.com/api/files.info?file=${fileId}&pretty=1`, {
            headers: {
                Authorization: `Bearer ${settings.slack.bot_token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to get file info: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.ok) {
            return data.file.size;
        } else {
            throw new Error(`Failed to get file info: ${data.error}`);
        }
    } catch (error) {
        console.error(`Error in getFileInfo: ${error.message}`);
        throw error;
    }
}

const app = new App({
  // logLevel: 'debug',
  socketMode: true,
  token: settings.slack.bot_token,
  appToken: settings.slack.app_token,
  agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
});



// 処理内容
app.event("message", async (e) => {

    // if (e?.message?.subtype || !e?.message) return
    if (!e?.message) return

    // メッセージデータ(リスト型で過去のメッセージ含め入れる)
    const messages = [
        ...settings.openai.system_roles
    ]

    // スレッドデータ
    const ts = e.message.ts;

    console.log(">>メッセージを受信");

    // スレッド内でメッセージが送信された場合
    if (e?.message?.thread_ts){


        // メッセージに画像が添付されている場合
        if (e.message.files && e.message.files.length > 0) {

            console.log("【スレッド内/画像あり】");

            // 添付ファイルから指定の拡張子のみ抽出
            const images = e.message.files.filter(file => {
                return ['png', 'jpeg', 'jpg', 'webp'].includes(file.filetype);
            });
            // 画像の成約を確認
            // ファイルの拡張子(gif非対応)
            const unsupportedFiles = e.message.files.filter(file => !['png', 'jpeg', 'jpg', 'webp'].includes(file.filetype));
            if (unsupportedFiles.length > 0) {
                await e.say({
                    text: "ファイルはpng/jpeg/jpg/webpのみ対応しています。",
                    thread_ts: e.message.ts,
                });
                return;
            }
            // ファイル数
            if (e.message.files.length > 10) {
                await e.say({
                    text: "送信できるファイルは最大10枚までです。",
                    thread_ts: e.message.ts,
                });
                return;
            }
            // スレッド内に送られた画像が合計10枚以下か
            const threadId = e.message.thread_ts;
            const threadFolder = `images/${threadId}`;
            let totalSize = 0;
            let threadImages = [];
            // スレッドIDと同じフォルダが存在する
            try {
                await fs.promises.access(threadFolder, fs.constants.F_OK);
                const files = await fs.readdir(threadFolder);
                console.log('このスレッドIDと同じフォルダが存在します'); //
                console.log(`添付画像枚数${e.message.files.length} / ディレクトリ内画像枚数${files.length}`);
                if (e.message.files.length + files.length > 10){
                    await e.say({
                        text: "1つのスレッド内に送信できるファイル数は10個までです。",
                        thread_ts: e.message.ts,
                    });
                    return;
                }
                for (const file of files) {
                    const filePath = `${threadFolder}/${file}`;
                    const stats = await fs.stat(filePath);
                    totalSize += stats.size;

                    // スレッドIDのフォルダに存在ファイルパスをリストに追加
                    threadImages.push(`./${threadFolder}/${file}`);
                }
                console.log('このスレッドには既に画像ファイルがあり容量は合計>>',totalSize);
            // スレッドIDと同じフォルダが存在しない
            } catch (err) {
                // スレッドIDのフォルダを作成する
                const newFolderPath = `images/${threadId}`;
                try{
                    await fs.promises.mkdir(newFolderPath);
                    console.log('このスレッドIDと同じフォルダが存在しません');
                    console.log(`${newFolderPath}というフォルダを作成しました`);
                }catch(err){
                    console.log(`Failed to create folder '${newFolderPath}': ${err.message}`);
                }
            }

            // スレッド内の合計ファイル容量が4MB以下か
            const maxSize = 4 * 1024 * 1024;
            const fileIds = images.map(file => file.id);
            const fileDataList = [];
            for (let i = 0; i < fileIds.length; i ++){
                const fileid = fileIds[i];
                const fileInfo = await getFileInfo(fileid);
                fileDataList.push(fileInfo);
            }
            try{
                for (const fileSize of fileDataList) {
                    totalSize += fileSize;
                }
            }catch{
                // 処理なし
            }
            console.log('今回送信された画像ファイルの容量をあわせて合計>>', totalSize);
            if (totalSize > maxSize){
                console.log('スレッド内のファイル容量が4MBを超えました。')
                await e.say({
                    text: "ファイルの容量は合計で4MBまでです。",
                    thread_ts: e.message.ts,
                });
                return;
            }
            
            // 画像の保存処理
            
            for (let i = 0; i < images.length; i++) {

                const image = images[i];
            
                try {
                    // Slackから画像をダウンロード
                    const imageRes = await fetch(image.url_private, {
                    headers: {
                        Authorization: `Bearer ${settings.slack.bot_token}`,
                    },
                    agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
                    responseType: 'arraybuffer',
                    });
            
                    if (!imageRes.ok) {
                        throw new Error(`Failed to download image: ${imageRes.statusText}`);
                    }
            
                    // 画像データをバッファとして取得
                    const buffer = await imageRes.arrayBuffer();
            
                    // 画像をローカルに保存
                    try{
                        const uuid = randomUUID();
                        const filename = `images/${threadId}/${uuid}.${image.filetype}`;
                        await fs.promises.writeFile(filename, Buffer.from(buffer));
                        let image_json_parse = JSON.parse(fs.readFileSync("./image.json"));
                        Object.assign(image_json_parse, {[`${image.url_private}`]: `${filename}`});
                        fs.writeFileSync("image.json", JSON.stringify(image_json_parse));
                        console.log('Data appended to image.json successfully.');
                        console.log(`Saved image as ${filename}`);
                        threadImages.push(`./${filename}`);
                    }catch(err){
                        console.error(`Failed to append data to image.json: ${err.message}`);
                    }
                } catch (err) {
                    console.error(`[Error saving image]: ${err}`);
                    e.say({
                        text: `画像の読み取りに失敗しました: (${err.message})`,
                        thread_ts: e.message.ts,
                    });
                }
            }


            // スレッド内のメッセージを取得
            const results = await app.client.conversations.replies({
                token: settings.slack.bot_token,
                channel: e.message.channel,
                ts: e.message.thread_ts,
            });
            for (const msg of results.messages) {
                if (msg?.app_id && (msg.text.includes("ファイルはpng/jpeg/jpg/webp/gifのみ対応しています。") || msg.text.includes("ファイルは最大10枚までです。") || msg.text.includes("ファイルの容量は合計で4MBまでです。"))) {
                    if (messages.length > 0) {
                        messages.pop(); 
                    }
                    
                    continue;
                }

                // 画像が添付されているメッセージの処理
                if (msg.files){
                    const imageUrls = msg.files.map(file => file.url_private);
                    console.log(imageUrls)
                    const data = JSON.parase(fs.readFileSync('./image.json'));
                    console.log(`${imageUrls}をimage.jsonから検索しました>>`,data[imageUrls]);
                    const text = `${msg.text} (画像ファイル${data[imageUrls]})`;
                    messages.push({
                        role:"user",
                        content:text
                    })

                }else{
                    
                    // メッセージのみの処理
                    // BOTの発言
                    if (msg?.app_id) {
                        if (msg.app_id != settings.slack.app_id) continue;
                        messages.push({
                            role: "assistant",
                            content: msg.text,
                        });
                    // ユーザーの発言
                    } else {
                        messages.push({
                            role: "user",
                            content: msg.text,
                        });
                    }
                }
            }
            if (!e.message.text){
                messages.push({
                    role:"user",
                    content:""
                })
            }else{
                messages.push({
                    role:"user",
                    content:e.message.text
                })
            }
            try {
                const chatgptResponse = await chatgptRequest(messages, threadImages);
                for (const choice of chatgptResponse?.choices) {
                    const text = choice.message?.content
                        .split("\n")
                        .map((v) => {
                        if (v.match(/^```.+$/)) {
                            return "```";
                        }
                        return v;
                        })
                        .join("\n");
        
                    e.say({
                        text,
                        thread_ts: ts,
                    });
                }
            } catch (err) {
                e.say({
                    text: err.message,
                    thread_ts: ts,
                });
            }
            
            // // メッセージに画像が添付されていない場合 & スレッド内
        }else{
            // メッセージに画像が添付されていない場合 & スレッド内
            console.log("【スレッド内/画像なし】");
            // スレッドIDのフォルダが存在するか
            const threadId = e.message.thread_ts;
            const threadFolder = `images/${threadId}`;
            const threadImages = [];
            try {
                await fs.promises.access(threadFolder, fs.constants.F_OK);
                const files = await fs.promises.readdir(threadFolder);
                console.log('このスレッドIDと同じフォルダが存在します'); //
                for(let i = 0; i < files.length; i++) {
                    const filename = files[i];
                    const filePath = threadFolder + '/' + filename;
                    threadImages.push(filePath); 
                }
            // スレッドIDと同じフォルダが存在しない
            } catch (err) {
                // 処理なし
            }
            const results = await app.client.conversations.replies({
                token: settings.slack.bot_token,
                channel: e.message.channel,
                ts: threadId,
            });
            for (const msg of results.messages) {
                if (msg?.app_id && (msg.text.includes("ファイルはpng/jpeg/jpg/webp/gifのみ対応しています。") || msg.text.includes("ファイルは最大10枚までです。") || msg.text.includes("ファイルの容量は合計で4MBまでです。"))) {
                    if (messages.length > 0) {
                        messages.pop(); 
                    }
                    
                    continue;
                }

                // 画像が添付されているメッセージの処理
                if (msg.files){
                    const imageUrls = msg.files.map(file => file.url_private);
                    const data = JSON.parse(fs.readFileSync('image.json','utf-8'));
                    console.log(`${imageUrls}をimage.jsonから検索しました>>`,data[imageUrls]);
                    const text = `${msg.text} (画像ファイル${data[imageUrls]})`;
                    messages.push({
                        role:"user",
                        content:text
                    })

                }else{
                    
                    // メッセージのみの処理
                    // BOTの発言
                    if (msg?.app_id) {
                        if (msg.app_id != settings.slack.app_id) continue;
                        messages.push({
                            role: "assistant",
                            content: msg.text,
                        });
                    // ユーザーの発言
                    } else {
                        messages.push({
                            role: "user",
                            content: msg.text,
                        });
                    }
                }
            }
            if (!e.message.text){
                messages.push({
                    role:"user",
                    content:""
                })
            }else{
                messages.push({
                    role:"user",
                    content:e.message.text
                })
            }
            try {
                const chatgptResponse = await chatgptRequest(messages, threadImages);
                console.log("this is called", chatgptResponse)
                for (const choice of chatgptResponse.choices) {
                    const text = choice.message?.content
                        .split("\n")
                        .map((v) => {
                        if (v.match(/^```.+$/)) {
                            return "```";
                        }
                        return v;
                        })
                        .join("\n");
        
                    e.say({
                        text,
                        thread_ts: ts,
                    });
                }
            } catch (err) {
                e.say({
                    text: err.message,
                    thread_ts: ts,
                });
            }

        }
        // メッセージに画像が添付されていない場合 & スレッド内

    
    // スレッド外でメッセージが送信された場合
    }else{
        
        // メッセージに画像が添付されている場合
        if (e.message.files && e.message.files.length > 0){
            console.log("【スレッド外/画像あり】");

            // 添付ファイルから指定の拡張子のみ抽出
            const images = e.message.files.filter(file => {
                return ['png', 'jpeg', 'jpg', 'webp'].includes(file.filetype);
            });
            // 画像の成約を確認
            // ファイルの拡張子(gif非対応)
            const unsupportedFiles = e.message.files.filter(file => !['png', 'jpeg', 'jpg', 'webp'].includes(file.filetype));
            if (unsupportedFiles.length > 0) {
                await e.say({
                    text: "ファイルはpng/jpeg/jpg/webpのみ対応しています。",
                    thread_ts: e.message.ts,
                });
                return;
            }
            // ファイル数
            if (e.message.files.length > 10) {
                await e.say({
                    text: "送信できるファイルは最大10枚までです。",
                    thread_ts: e.message.ts,
                });
                return;
            }
            // スレッド内に送られた画像が合計10枚以下か
            let totalSize = 0;
            
            // スレッド内の合計ファイル容量が4MB以下か
            const maxSize = 4 * 1024 * 1024;
            const fileIds = images.map(file => file.id);
            const fileDataList = [];
            for (let i=0; i<fileIds.length; i++){
                const fileid = fileIds[i];
                const fileInfo = await getFileInfo(fileid);
                fileDataList.push(fileInfo);
            }
            try{
                for (const fileSize of fileDataList) {
                    totalSize += fileSize;
                }
            }catch{
                // 処理なし
            }
            console.log('今回送信された画像ファイルの容量は合計>>', totalSize);
            if (totalSize > maxSize){
                console.log('ファイル容量が合計で4MBを超えました。')
                await e.say({
                    text: "ファイルの容量は合計で4MBまでです。",
                    thread_ts: e.message.ts,
                });
                return;
            }
            
            // 画像の保存処理

            let threadImages = [];

            const threadFolder_temp = `images/${ts}`;
            await fs.promises.mkdir(threadFolder_temp);

            for (let i = 0; i < images.length; i++) {

                const image = images[i];
                // console.log("imageデータ::", image);

                try {
                    // Slackから画像をダウンロード
                    const imageRes = await fetch(image.url_private, {
                    headers: {
                        Authorization: `Bearer ${settings.slack.bot_token}`,
                    },
                    agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
                    responseType: 'arraybuffer',
                    });
            
                    if (!imageRes.ok) {
                        throw new Error(`Failed to download image: ${imageRes.statusText}`);
                    }
            
                    // 画像データをバッファとして取得
                    const buffer = await imageRes.arrayBuffer();
                    
                    
                    // 画像をローカルに保存
                    try{
                        const uuid = randomUUID();                       
                        const filename = `images/${ts}/${uuid}.${image.filetype}`;
                        await fs.promises.writeFile(filename, Buffer.from(buffer));
                        // jsonファイルに追記
                        let image_json_parse = JSON.parse(fs.readFileSync("./image.json"));
                        Object.assign(image_json_parse, {[`${image.url_private}`]: `${filename}`});
                        fs.writeFileSync("image.json", JSON.stringify(image_json_parse));
                        threadImages.push(`./${filename}`);
                    }catch(err){
                        console.error(`Failed to append data to image.json: ${err.message}`);
                    }
                } catch (err) {
                    console.error(`[Error saving image]: ${err}`);
                    e.say({
                        text: `画像の読み取りに失敗しました: (${err.message})`,
                        thread_ts: e.message.ts,
                    });
                }
            } // for終わり

            const text = e.message.text || "この画像について説明してください";
            messages.push({
                role: "user",
                content: text,
            });

            try {
                const chatgptResponse = await chatgptRequest(messages, threadImages);
                for (const choice of chatgptResponse?.choices) {
                    const text = choice.message?.content
                        .split("\n")
                        .map((v) => {
                        if (v.match(/^```.+$/)) {
                            return "```";
                        }
                        return v;
                        })
                        .join("\n");
        
                    e.say({
                        text,
                        thread_ts: ts,
                    });
                }
            } catch (err) {
                e.say({
                    text: err.message,
                    thread_ts: ts,
                });
            }

            
        
        // 完成
        }else{
            // 完成
            console.log("【スレッド外/画像なし】");
            messages.push({
                role: "user",
                content: e.message.text,
            });
            const threadImages = [];
            try {
                const chatgptResponse = await chatgptRequest(messages, threadImages);
                for (const choice of chatgptResponse?.choices) {
                    const text = choice.message?.content
                        .split("\n")
                        .map((v) => {
                        if (v.match(/^```.+$/)) {
                            return "```";
                        }
                        return v;
                        })
                        .join("\n");
        
                    e.say({
                        text,
                        thread_ts: ts,
                    });
                }
            } catch (err) {
                e.say({
                    text: err.message,
                    thread_ts: ts,
                });
            }

        }

        // メッセージに画像が添付されていない場合 & スレッド内 (完成)
    }











//     let savedImages = [];
//     if (e.message.files && e.message.files.length > 0) {
//         const images = e.message.files.filter(file => {
//             // 画像ファイルの形式をチェック
//             return ['png', 'jpeg', 'jpg', 'webp'].includes(file.filetype);
//         });
    
//         const unsupportedFiles = e.message.files.filter(file => !['png', 'jpeg', 'jpg', 'webp', 'gif'].includes(file.filetype));
//         if (unsupportedFiles.length > 0) {
//             await e.say({
//                 text: "ファイルはpng/jpeg/jpg/webp/gifのみ対応しています。",
//                 thread_ts: e.message.ts,
//             });
//         }

//         // ファイルが11枚以上の場合
//         if (e.message.files.length > 10) {
//             await e.say({
//                 text: "ファイルは最大10枚までです。",
//                 thread_ts: e.message.ts,
//             });
//         }

//         // 画像の枚数と合計サイズの制限
//         const maxImages = 10;
//         const maxSize = 4 * 1024 * 1024; // 4MB
//         let totalSize = 0;
    
//         for (let i = 0; i < Math.min(images.length, maxImages); i++) {

//             const image = images[i];
//             totalSize += image.size;
        
//             if (totalSize > maxSize) {
//                 await e.say({
//                     text: "ファイルの容量は合計で4MBまでです。",
//                     thread_ts: e.message.ts,
//                 });
//                 break; // 合計サイズが4MBを超えたら処理を中断
//             }
        
//             try {
//                 // Slackから画像をダウンロード
//                 const imageRes = await fetch(image.url_private, {
//                 headers: {
//                     Authorization: `Bearer ${settings.slack.bot_token}`,
//                 },
//                 agent: proxy ? new HttpsProxyAgent(proxy) : undefined,
//                 responseType: 'arraybuffer',
//                 });
        
//                 if (!imageRes.ok) {
//                     throw new Error(`Failed to download image: ${imageRes.statusText}`);
//                 }
        
//                 // 画像データをバッファとして取得
//                 const buffer = await imageRes.arrayBuffer();
        
//                 // 画像をローカルに保存
//                 const filename = `temp/${e.message.user}_${i + 1}.${image.filetype}`;
//                 // fs.writeFileSync(filename, buffer);
//                 await fs.promises.writeFile(filename, Buffer.from(buffer));
//                 savedImages.push(filename);
//                 console.log(`Saved image as ${filename}`);
//             } catch (err) {
//                 console.error(`[Error saving image]: ${err}`);
//                 e.say({
//                     text: `画像の読み取りに失敗しました: (${err.message})`,
//                     thread_ts: e.message.ts,
//                 });
//             }
//         }
//     }

//     if (e?.message?.subtype) return;

//     const messages = [...settings.openai.system_roles];

//     // 送信したメッセージが既にスレッド内のメッセージの場合
//     // スレッド内のメッセージを変数messagesに配列として入れる
//     if (e?.message?.thread_ts) {
//         const results = await app.client.conversations.replies({
//             token: settings.slack.bot_token,
//             channel: e.message.channel,
//             ts: e.message.thread_ts,
//         });
//         for (const msg of results.messages) {
//             if (msg?.app_id && (msg.text.includes("ファイルはpng/jpeg/jpg/webp/gifのみ対応しています。") || msg.text.includes("ファイルは最大10枚までです。") || msg.text.includes("ファイルの容量は合計で4MBまでです。"))) {
//                 if (messages.length > 0) {
//                     messages.pop(); 
//                 }
                
//                 continue;
//             }

//             // BOTの発言
//             if (msg?.app_id) {
//                 if (msg.app_id != settings.slack.app_id) continue;
//                 messages.push({
//                     role: "assistant",
//                     content: msg.text,
//                 });
//             // ユーザーの発言
//             } else {
//                 messages.push({
//                     role: "user",
//                     content: msg.text,
//                 });
//             }
//         }
//     // メッセージが会話の最初の発言の場合(e.message.text : ユーザーが送信したメッセージ内容)
//     } else {

//         // 画像だけが送られた場合
//         if (!e.message.text){
//             messages.push({
//                 role: "user",
//                 content: "画像の内容を説明してください",
//             });
//         }else{
//             messages.push({
//                 role: "user",
//                 content: e.message.text,
//             });
//         }
//     }

//     console.log(messages);


//     const ts = e.message.ts;

//     // 画像が添付されている場合
//     if (savedImages.length > 0){

//         console.log("添付ファイルが存在します");
//         const text = messages || ["画像の内容を説明してください"];

//         try {
//             const chatgptResponse = await chatgptRequest(text, savedImages);
//             for (const choice of chatgptResponse?.choices) {
//                 const text = choice.message?.content
//                     .split("\n")
//                     .map((v) => {
//                     if (v.match(/^```.+$/)) {
//                         return "```";
//                     }
//                     return v;
//                     })
//                     .join("\n");
    
//                 e.say({
//                     text,
//                     thread_ts: ts,
//                 });
//             }
//         } catch (err) {
//             e.say({
//                 text: err.message,
//                 thread_ts: ts,
//             });
//         }

//     // 文字だけの場合
//     }else{

//         console.log("テキストだけの送信です");
        
//         try {
//             const image_path = [];
//             const chatgptResponse = await chatgptRequest(messages, image_path);
//             for (const choice of chatgptResponse?.choices) {
//                 const text = choice.message?.content
//                     .split("\n")
//                     .map((v) => {
//                     if (v.match(/^```.+$/)) {
//                         return "```";
//                     }
//                     return v;
//                     })
//                     .join("\n");
    
//                 e.say({
//                     text,
//                     thread_ts: ts,
//                 });
//             }
//         } catch (err) {
//             e.say({
//                 text: err.message,
//                 thread_ts: ts,
//             });
//         }
//     }
// });

// app.command("/chatgpt", async (e) => {
//   try {
//     await e.ack();

//     const user_id = e.command.user_id;

//     if (!settings.admin.includes(user_id)) {
//       return await e.client.chat.postMessage({
//         channel: user_id,
//         text: "You don't have permission",
//       });
//     }

//     const command = e.command.text.split(" ");

//     let text, tmp;

//     switch (command[0]) {
//       case "add":
//         try {
//           addSettings(command[1], command.splice(2));
//           text = "Successfully add settings!";
//         } catch (e) {
//           text = `Error occurred\nreasons: ${e.message}`;
//         }
//         break;
//       case "remove":
//         try {
//           removeSettings(command[1], command.splice(2));
//           text = "Successfully remove settings!";
//         } catch (e) {
//           text = `Error occurred\nreasons: ${e.message}`;
//         }
//         break;
//       case "update":
//         try {
//           updateSettings(command[1], command.splice(2));
//           text = "Successfully update settings!";
//         } catch (e) {
//           text = `Error occurred\nreasons: ${e.message}`;
//         }
//         break;
//       case "get":
//         text = "```" + JSON.stringify(settings, null, 4) + "```";
//         break;
//       case "help":
//         text = help(command?.splice(1)[0]);
//         break;
//       case "reload_settings":
//         tmp = JSON.parse(fs.readFileSync("settings.json"));
//         for (let key in tmp) {
//           settings[key] = tmp[key];
//         }
//         text = "Successfully reload settings";
//         break;
//       default:
//         text = "command not found";
//     }

//     await e.client.chat.postMessage({
//       channel: user_id,
//       text,
//     });
//   } catch (e) {
//     console.log(e);
//   }



});


// bot実行
!(async () => {
    await app.start();
    await console.log("successful");
})();