// ============================================================
// 椰果图片中转服务（部署在 100000whys.cn 服务器上）
// 作用：接收 APP 上传的图片/截屏 → 返回一个国内可达的 URL
//       （MiniMax M3 视觉分析需要能拉取到的图片 URL）
// 依赖：npm i express multer   （Node 16+）
// 启动：YEGUO_TOKEN=换成你的口令 node upload-server.js
// 建议用 pm2 常驻，并在 Nginx 把 /yeguo/* 反代到本服务端口
// ============================================================
const express = require('express')
const multer = require('multer')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const PORT = process.env.PORT || 8787
const TOKEN = process.env.YEGUO_TOKEN || 'change-me-please'
const KEEP_DAYS = parseInt(process.env.KEEP_DAYS || '7', 10) // 图片保留天数，到期自动清

const DIR = path.join(__dirname, 'imgs')
fs.mkdirSync(DIR, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DIR),
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.jpg')
  }),
  limits: { fileSize: 20 * 1024 * 1024 } // 单图上限 20MB
}).single('file')

const app = express()

// 简单口令校验（防陌生人乱传）
function checkToken(req, res, next) {
  if ((req.headers['x-yeguo-token'] || '') !== TOKEN) {
    return res.status(401).json({ ok: false, error: 'bad token' })
  }
  next()
}

// 上传：POST /yeguo/upload  (multipart 字段名 file)
app.post('/yeguo/upload', checkToken, (req, res) => {
  upload(req, res, err => {
    if (err) return res.status(500).json({ ok: false, error: String(err) })
    if (!req.file) return res.status(400).json({ ok: false, error: 'no file' })
    const host = req.headers['x-forwarded-host'] || req.headers.host
    res.json({ ok: true, url: `https://${host}/yeguo-img/${req.file.filename}` })
  })
})

// 静态访问：GET /yeguo-img/xxx.jpg  （MiniMax 服务器来拉图就走这里）
app.use('/yeguo-img', express.static(DIR, { maxAge: '7d' }))

// 过期清理：每天扫一次，删掉超期图片
setInterval(() => {
  const cutoff = Date.now() - KEEP_DAYS * 86400_000
  for (const f of fs.readdirSync(DIR)) {
    const p = path.join(DIR, f)
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p) } catch (_) {}
  }
}, 6 * 3600_000).unref()

app.listen(PORT, () => console.log(`[yeguo-upload] listening on :${PORT}`))
