// Renders build/icon.png (512×512) from the same SVG the app shows. Run: npx electron scripts/make-icon.mjs
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('src/renderer/src/assets/icon.svg', 'base64')
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false })
  await w.loadURL('about:blank')
  const png = await w.webContents.executeJavaScript(`new Promise((ok, fail) => {
    const img = new Image(), c = document.createElement('canvas')
    c.width = c.height = 512
    img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 512, 512); ok(c.toDataURL('image/png')) }
    img.onerror = fail
    img.src = 'data:image/svg+xml;base64,${svg}'
  })`)
  writeFileSync('build/icon.png', Buffer.from(png.split(',')[1], 'base64'))
  console.log('build/icon.png written')
  app.quit()
})
