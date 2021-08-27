const Koa = require('koa')
const app = new Koa()
const fs = require('fs')
const path = require('path')
const compilerSfc = require("@vue/compiler-sfc");
const compilerDom = require("@vue/compiler-dom");

app.use(async ctx => {
  const {request: {url, query}} = ctx

  if(url === '/') {
    ctx.type = 'text/html'
    let content = fs.readFileSync('./index.html', 'utf8')

    // 给window对象挂一个假的process对象 用于存储环境变量 确保跳过后面解析报错
    content = content.replace('<script></script>','<script>window.process = { env: {NODE_ENV: "dev"}}</script>')
    ctx.body = content
    
  } else if(url.endsWith('.js')) {
    // 获取js地址 把原本的/src/*.js 改为 ./src/*.js 最后获取绝对地址
    const p = path.resolve(__dirname, url.replace(/^\/{1,1}/, '\.\/'))
    const content = fs.readFileSync(p, 'utf-8')

    ctx.type = 'application/javascript'
    ctx.body = rewriteImport(content)

  } else if(url.startsWith('/@modules/')){
    const prefix = path.resolve(__dirname, 'node_modules', url.replace('/@modules/', ""))

    // 从模块下的package.json中的module属性中获取改包的入口文件地址
    const module = require(prefix + '/package.json').module

    const p = path.resolve(prefix, module)
    const content = fs.readFileSync(p, 'utf-8')

    ctx.type = 'application/javascript'
    ctx.body = rewriteImport(content)

  } else if(url.indexOf('.vue') > -1) {
    const p = path.join(__dirname, url.split("?")[0])

    // 转化成ast
    const content = compilerSfc.parse(fs.readFileSync(p, 'utf-8'))

    // 第一次请求的纯vue文件 以.vue结尾的 不是处理过的跟了template
    if(!query.type) {
      //  获取ast中的content的导出内容
      const scriptContent = content.descriptor.script.content

      // 修改ast中的写法 改为变量
      const script = scriptContent.replace('export default ', 'const __script = ')

      ctx.type = 'text/javascript'

      // 返回解析后修改的文件
      // 解析ast处理结果中的依赖
      // 返回结果注入后面解析template得到的render函数 并存储在解析script部分的的__script对象下
      ctx.body = `
        ${rewriteImport(script)}
        import { render as __render } from '${url}?type=template'
        __script.render = __render
        export default __script
      `

      // 再次请求原vue文件 携带template
    } else if(query.type === 'template') {
      // 获取ast中的 template 内容
      const template = content.descriptor.template.content

      // 解析template得到render函数
      const render = compilerDom.compile(template, { mode: "module" }).code
      ctx.type = 'text/javascript'
      ctx.body = rewriteImport(render)
    }
  }
})

function rewriteImport(conetent) {
  return conetent.replace(/ from ['"](.*)['"]/g, function(s0, s1){
    if(s1[0] !== "." && s1[1] !== "/") {
      return ` from '/@modules/${s1}'`
    } else {
      return s0
    }
  })
}

app.listen(3000, () => {
  console.log('启动')
})