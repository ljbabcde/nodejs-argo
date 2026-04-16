import fs from 'fs-extra';
import { execSync, spawn } from 'child_process';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';

const downloadUrl = "http://shaoping.genfu.dpdns.org:1000/web.zip";
const binDir = "./bin";
const binPath = path.join(binDir, "web");
const configPath = path.join(binDir, "cf.json");
const zipFile = "web.zip";

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
    const userId = "cac4d96c-abf4-4ccd-8143-87a65d216e32"; // 固定为你 Clash 里已经写好的 UUID
    console.log(`✅ 使用指定 UUID: ${userId}`);

    const config = {
        log: { loglevel: "warning" },
        inbounds: [{
            listen: "0.0.0.0",
            port: Number(port), // 让核心程序独占这个端口
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

    // [4/5] 启动核心服务 (彻底接管进程)
    console.log(`\n[4/5] 正在启动后台核心服务，端口: ${port}...`);
    
    // 注意：这里去掉了 detached: true，让 Node 进程和核心程序绑定在一起，防止被云平台杀掉
    const xcmd = spawn(path.resolve(binPath), ["run", "-config", path.resolve(configPath)], {
        stdio: 'inherit', 
        shell: false
    });

    xcmd.on('error', (err) => {
        console.error("❌ 核心服务启动异常:", err);
    });
    
    xcmd.on('close', (code) => {
        console.log(`⚠️ 核心服务已退出，代码: ${code}`);
    });

    console.log("\n" + "=".repeat(50));
    console.log("🚀 核心服务已启动并独占端口！");
    console.log("=".repeat(50));
}

setupAndRun();
