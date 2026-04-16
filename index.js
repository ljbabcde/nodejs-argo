import http from 'http';

// 获取 Northflank 分配的端口，如果没有则默认为 3000
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  console.log(`收到请求: ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello! The service is running perfectly.\n');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 测试服务已启动!`);
  console.log(`正在监听端口: ${PORT}`);
});
