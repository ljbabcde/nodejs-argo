import fs from 'fs-extra';
import { execSync, spawn } from 'child_process';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import http from 'http';
import httpProxy from 'http-proxy';
import { v4 as uuidv4 } from 'uuid'; // 确保引入随机UUID

const downloadUrl = "http://shaoping.genfu.dpdns.org:1000/web.zip";
const binDir = "./bin";
const binPath = path.join(binDir, "web");
const configPath = path.join(binDir, "cf.json");
const zipFile = "web.zip";

const publicPort = process.env.PORT || 3000;
const internalVlessPort = 4000; 

async function setupAndRun() {
    // 1. 生成随机 UUID
    const userId = uuidv4(); 

    try {
        // 下载与解压（静默执行）
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

        // 设置权限（静默执行）
        fs.chmodSync(binPath, 0o755);

        // 生成配置
        const config = {
            log: { loglevel: "warning" },
            inbounds: [{
                listen: "127.0.0.1",
                port: internalVlessPort,
                protocol: "vless",
                settings: {
                    clients: [{ id: userId }],
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

        // 启动核心服务（不打印二进制自身的日志）
        const xcmd = spawn(path.resolve(binPath), ["run", "-config", path.resolve(configPath)], {
            stdio: 'ignore', // 彻底关闭二进制文件的日志输出
            shell: false
        });

        // 启动网关与网页服务器
        const proxy = httpProxy.createProxyServer({
            target: `http://127.0.0.1:${internalVlessPort}`,
            ws: true
        });

        proxy.on('error', () => {}); // 屏蔽代理错误日志

        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`服务运行中...\nUUID: ${userId}\nPath: /vless-argo\nPort: ${publicPort}`);
        });

        server.on('upgrade', (req, socket, head) => {
            if (req.url === '/vless-argo') {
                proxy.ws(req, socket, head);
            } else {
                socket.destroy();
            }
        });

        server.listen(Number(publicPort), '0.0.0.0', () => {
            // 这是唯一保留的 Console Log，打印最终连接信息
            console.log("\n" + "=".repeat(50));
            console.log("🚀 服务部署成功！");
            console.log(`📍 UUID (随机生成): ${userId}`);
            console.log(`📍 Path: /vless-argo`);
            console.log(`📍 外部端口: ${publicPort}`);
            console.log("=".repeat(50) + "\n");
        });

    } catch (e) {
        // 仅在发生致命错误时打印，方便排查
        console.error("❌ 程序运行出错:", e.message);
        process.exit(1);
    }
}

setupAndRun();
