import fs from 'fs-extra';
import { execSync, spawn } from 'child_process';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import http from 'http'; // 引入 http 模块

const downloadUrl = "http://shaoping.genfu.dpdns.org:1000/web.zip";
const binDir = "./bin";
const binPath = path.join(binDir, "web");
const configPath = path.join(binDir, "cf.json");
const zipFile = "web.zip";

// 获取端口，默认 3000
const port = process.env.PORT || 3000;

async function setupAndRun() {
    console.log("=".repeat(50));
    console.log("🚀 开始一键自动部署服务...");
    console.log("=".repeat(50));

    // [1/5] 下载并解压
    console.log("\n[1/5] 下载并解压核心文件...");
    try {
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
        console.log("✅ 下载完成");
    } catch (e) {
        console.error("❌ 下载失败:", e.message);
        process.exit(1);
    }

    // [2/5] 设置权限
    console.log("\n[2/5] 设置执行权限...");
    try {
        fs.chmodSync(binPath, 0o755);
        console.log("✅ 权限设置成功");
    } catch (e) {
        console.error("❌ 权限设置失败:", e.message);
    }

    // [3/5] 生成配置
    const userId = uuidv4();
    console.log(`✅ 生成 UUID: ${userId}`);

    const config = {
        log: { loglevel: "warning" },
        inbounds: [{
            listen: "0.0.0.0",
            port: Number(port), // 监听云平台分配的端口
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

    try {
        await fs.outputJson(configPath, config, { spaces: 2 });
    } catch (e) {
        console.error("❌ 配置生成失败:", e.message);
        process.exit(1);
    }

    // [4/5] 启动核心服务
    console.log("\n[4/5] 正在启动后台核心服务...");
    const xcmd = spawn(path.resolve(binPath), ["run", "-config", path.resolve(configPath)], {
        stdio: 'inherit', // 直接将子进程日志输出到控制台
        shell: false
    });

    xcmd.on('error', (err) => {
        console.error("❌ 核心服务启动异常:", err);
    });

    // [5/5] 创建 HTTP 哑服务器（关键：保活并监听端口）
    console.log(`\n[5/5] 正在启动端口监听服务: ${port}`);
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('服务运行中...\n' + `UUID: ${userId}\nPath: /vless-argo\nPort: ${port}`);
    });

    server.listen(Number(port), '0.0.0.0', () => {
        console.log("\n" + "=".repeat(50));
        console.log("🚀 所有服务已就绪！");
        console.log(`📍 状态检查地址: http://0.0.0.0:${port}`);
        console.log(`📍 UUID: ${userId}`);
        console.log("=".repeat(50));
    });
}

setupAndRun();
