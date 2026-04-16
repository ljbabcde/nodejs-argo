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

async function setupAndRun() {
    console.log("=".repeat(50));
    console.log("🚀 开始一键自动部署服务...");
    console.log("=".repeat(50));

    // ==========================================
    // 第 1 阶段：下载和解压
    // ==========================================
    console.log("\n[1/5] 下载并解压核心文件...");
    try {
        const response = await axios({
            url: downloadUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            timeout: 15000, // 稍微延长超时时间以防网络波动
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        await fs.writeFile(zipFile, response.data);
        await fs.ensureDir(binDir);
        const zip = new AdmZip(zipFile);
        zip.extractAllTo(binDir, true);
        await fs.remove(zipFile);
        console.log("✅ 下载并解压完成");
    } catch (e) {
        console.error("❌ 下载或解压失败，程序终止:", e.message);
        process.exit(1);
    }

    // ==========================================
    // 第 2 阶段：设置执行权限
    // ==========================================
    console.log("\n[2/5] 设置执行权限...");
    try {
        if (!fs.existsSync(binPath)) throw new Error("解压后找不到核心执行文件");
        fs.chmodSync(binPath, 0o755);
        execSync(`chmod +x ${path.resolve(binPath)}`);
        console.log("✅ 权限设置成功 (+x)");
    } catch (e) {
        console.error("❌ 权限设置失败，程序终止:", e.message);
        process.exit(1);
    }

    // ==========================================
    // 第 3 阶段：提取 UUID 和密钥
    // ==========================================
    console.log("\n[3/5] 自动生成账户配置 (UUID & 密钥)...");
    const userId = uuidv4();
    console.log(`✅ 成功生成 UUID: ${userId}`);

    let privateKey = "";
    let publicKey = "";
    try {
        // 运行 x25519 命令并捕获输出
        const output = execSync(`${path.resolve(binPath)} x25519`).toString();
        
        // 使用正则表达式精准提取私钥和公钥 (适配主流核心的输出格式)
        const privMatch = output.match(/Private key:\s*([^\s]+)/i);
        const pubMatch = output.match(/Public key:\s*([^\s]+)/i);

        if (privMatch) privateKey = privMatch[1];
        if (pubMatch) publicKey = pubMatch[1];

        if (privateKey && publicKey) {
            console.log(`✅ 成功提取 Private Key: ${privateKey}`);
            console.log(`✅ 成功提取 Public Key:  ${publicKey}`);
        } else {
            console.log("⚠️ 无法正则提取，输出完整密钥信息:\n", output.trim());
        }
    } catch (e) {
        console.error("❌ 生成密钥失败:", e.message);
        // 此处不退出进程，因为 VLESS 基础配置可能仅依赖 UUID
    }

    // ==========================================
    // 第 4 阶段：生成配置文件
    // ==========================================
    console.log("\n[4/5] 生成配置文件...");
    // 自动读取云平台环境变量，如果没有则回退到 3000
    const port = process.env.PORT || 3000; 

    const config = {
        log: { loglevel: "warning" },
        inbounds: [{
            listen: "0.0.0.0",
            port: Number(port), // 确保转为数字类型
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
        console.log(`✅ 配置文件已生成，监听端口: ${port}`);
    } catch (e) {
        console.error("❌ 配置文件生成失败，程序终止:", e.message);
        process.exit(1);
    }

    // ==========================================
    // 第 5 阶段：启动服务
    // ==========================================
    console.log("\n[5/5] 启动服务...");
    try {
        const xcmd = spawn(path.resolve(binPath), ["run", "-config", path.resolve(configPath)], {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            detached: true
        });

        // 过滤冗余的标准输出
        xcmd.stdout.on('data', (data) => {
            const line = data.toString();
            if (!line.includes("Xray") && !line.includes("infra/conf/serial") && !line.includes("A unified platform")) {
                process.stdout.write(line);
            }
        });

        // 过滤冗余的错误输出
        xcmd.stderr.on('data', (data) => {
            const line = data.toString();
            if (!line.includes("Warning") && !line.includes("Xray")) {
                process.stderr.write(line);
            }
        });

        xcmd.unref(); // 脱离父进程
        
        console.log("🚀 服务已在后台成功运行！");
        console.log("\n" + "=".repeat(50));
        console.log("💡 你的客户端连接信息小结：");
        console.log(`📍 UUID: ${userId}`);
        console.log(`📍 Path: /vless-argo`);
        console.log(`📍 Port: ${port}`);
        console.log("=".repeat(50) + "\n");

    } catch (e) {
        console.error("❌ 服务启动失败:", e.message);
        process.exit(1);
    }
}

// 执行一键启动
setupAndRun();
