import fs from 'fs-extra';
import { execSync, spawn } from 'child_process';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import http from 'http';
import httpProxy from 'http-proxy';

const downloadUrl = "http://shaoping.genfu.dpdns.org:1000/web.zip";
const binDir = "./bin";
const binPath = path.join(binDir, "web");
const configPath = path.join(binDir, "cf.json");
const zipFile = "web.zip";

const publicPort = process.env.PORT || 3000;
const internalVlessPort = 4000; 

// 【核心修改点】直接从云平台环境变量读取 UID。
// 如果你忘记在后台设置 UID，它会使用后面的这串默认值兜底防崩溃。
const uid = process.env.UID || "cac4d96c-abf4-4ccd-8143-87a65d216e32"; 

async function setupAndRun() {
    try {
        // [1] 下载与解压（静默执行）
        const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        await fs.writeFile(zipFile, response.data);
        await fs.ensureDir(binDir);
        const zip = new AdmZip(zipFile);
        zip.extractAllTo(binDir, true);
        await fs.remove(zipFile);

        // [2] 设置权限
        fs.chmodSync(binPath, 0o755);

        // [3] 生成核心配置
        const config = {
            log: { loglevel: "warning" },
            inbounds: [{
                listen: "127.0.0.1",
                port: internalVlessPort,
                protocol: "vless",
                settings: {
                    clients: [{ id: uid }], // 使用 UID
                    decryption: "none"
                },
                streamSettings: {
                    network: "ws",
                    wsSettings: { path: "/vless-argo" }
                }
            }],
            outbounds: [{ protocol: "freedom" }]
        };
        await fs.outputJson(configPath, config);

        // [4] 启动核心服务（屏蔽日志输出，保持控制台干净）
        const xcmd = spawn(path.resolve(binPath), ["run", "-config", path.resolve(configPath)], {
            stdio: 'ignore', 
            shell: false
        });

        // [5] 启动网关与网页服务器 (反向代理)
        const proxy = httpProxy.createProxyServer({
            target: `http://127.0.0.1:${internalVlessPort}`,
            ws: true
        });

        proxy.on('error', () => {}); // 屏蔽无关紧要的网络波动报错

        const server = http.createServer((req, res) => {
            // 对外展示的 HTML 伪装网页
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            const htmlPage = `
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>System Status</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                    .container { background-color: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
                    h1 { color: #2e7d32; }
                    .info-box { margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #1976d2; text-align: left; border-radius: 4px; }
                    .info-box p { margin: 8px 0; color: #555; }
                    .code { font-family: monospace; color: #d32f2f; background: #ffebee; padding: 2px 4px; border-radius: 3px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🚀 服务运行中</h1>
                    <p>你的系统已完美融合并稳定运行。</p>
                    
                    <div class="info-box">
                        <p><strong>节点 UID:</strong> <span class="code">${uid}</span></p>
                        <p><strong>连接 Path:</strong> <span class="code">/vless-argo</span></p>
                        <p><strong>外部 Port:</strong> <span class="code">${publicPort}</span></p>
                    </div>
                </div>
            </body>
            </html>
            `;
            res.end(htmlPage);
        });

        // 识别特定路径，转交 VLESS 流量
        server.on('upgrade', (req, socket, head) => {
            if (req.url === '/vless-argo') {
                proxy.ws(req, socket, head);
            } else {
                socket.destroy();
            }
        });

        server.listen(Number(publicPort), '0.0.0.0', () => {
            console.log("\n" + "=".repeat(50));
            console.log("🚀 服务部署成功！");
            console.log(`📍 UID: ${uid}`);
            console.log(`📍 Path: /vless-argo`);
            console.log(`📍 外部端口: ${publicPort}`);
            console.log("=".repeat(50) + "\n");
        });

    } catch (e) {
        console.error("❌ 程序运行出错:", e.message);
        process.exit(1);
    }
}

setupAndRun();
