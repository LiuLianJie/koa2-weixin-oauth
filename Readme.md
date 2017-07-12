###### 使用用例

		const Koa = require("koa");
		const Router = require("koa-router");
		const Auth = require("koa2-weixin-auth");

		const app = new Koa();
		const router = new Router();
		const auth = new Auth("appid","appsecret");

		router.get("/", async(ctx, next) => {
			const url = await auth.getAuthorizeURL('redirect_url','snsapi_userinfo','');
			ctx.redirect(url);
		})

		router.get("/getcode", async(ctx, next) => {
			const token = await auth.getAccessToken(ctx.request.query.code);
			const accessToken = token.data.access_token;
			const openid = token.data.openid;
			const userinfo = await auth.getUser(openid);
			
		})

		app.use(router.routes());
		app.listen(3000);