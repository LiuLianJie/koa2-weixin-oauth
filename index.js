const querystring = require("querystring");
const request = require("request");

const AccessToken = function(data){
	if(!(this instanceof AccessToken)){
		return new AccessToken(data);
	}
	this.data = data;
}

/*!
 * 检查AccessToken是否有效，检查规则为当前时间和过期时间进行对比
 *
 * Examples:
 * ```
 * token.isValid();
 * ```
 */
AccessToken.prototype.isValid = function() {
	return !!this.data.access_token && (new Date().getTime()) < (this.data.create_at + this.data.expires_in * 1000);
}

/**
 * 根据appid和appsecret创建OAuth接口的构造函数
 * 如需跨进程跨机器进行操作，access token需要进行全局维护
 * 使用使用token的优先级是：
 *
 * 1. 使用当前缓存的token对象
 * 2. 调用开发传入的获取token的异步方法，获得token之后使用（并缓存它）。

 * Examples:
 * ```
 * var OAuth = require('oauth');
 * var api = new OAuth('appid', 'secret');
 * ```
 * @param {String} appid 在公众平台上申请得到的appid
 * @param {String} appsecret 在公众平台上申请得到的app secret
 */
const Auth =  function (appid, appsecret) {
	this.appid = appid;
  	this.appsecret = appsecret;
  	this.store = {};
  	
  	this.getToken = function (openid) {
    	return this.store[openid];
  	};

  	this.saveToken = function (openid, token) {
	    this.store[openid] = token;
	};
}

/**
 * 获取授权页面的URL地址
 * @param {String} redirect 授权后要跳转的地址
 * @param {String} state 开发者可提供的数据
 * @param {String} scope 作用范围，值为snsapi_userinfo和snsapi_base，前者用于弹出，后者用于跳转
 */
Auth.prototype.getAuthorizeURL = function(redirect_uri, scope, state) {
	return new Promise((resolve, reject) => {
		const url = "https://open.weixin.qq.com/connect/oauth2/authorize";
		let info = {
			appid: this.appid,
			redirect_uri: redirect_uri,
			scope: scope || 'snsapi_base',
			state: state || '',
			response_type: 'code'
		}
		resolve(url + '?' + querystring.stringify(info) + '#wechat_redirect')
	})
}

/*!
 * 处理token，更新过期时间
 */
Auth.prototype.processToken = function(data){
	data.create_at = new Date().getTime();
	// 存储token
  	this.saveToken(data.openid, data);
  	return AccessToken(data);
}

/**
 * 根据授权获取到的code，换取access token和openid
 * 获取openid之后，可以调用`wechat.API`来获取更多信息
 * Examples:
 * ```
 * api.getAccessToken(code);
 * ```
 * Exception:
 *
 * - `err`, 获取access token出现异常时的异常对象
 *
 * 返回值:
 * ```
 * {
 *  data: {
 *    "access_token": "ACCESS_TOKEN",
 *    "expires_in": 7200,
 *    "refresh_token": "REFRESH_TOKEN",
 *    "openid": "OPENID",
 *    "scope": "SCOPE"
 *  }
 * }
 * ```
 * @param {String} code 授权获取到的code
 */
Auth.prototype.getAccessToken = function(code){
	return new Promise((resolve, reject) => {
		const url = "https://api.weixin.qq.com/sns/oauth2/access_token";
		const info = {
			appid: this.appid,
			secret: this.appsecret,
			code: code,
			grant_type: 'authorization_code'
		}
		request.post(url,{form:info},(err, res, body) => {
			if(err){
				reject(err)
			}else{
				const data = JSON.parse(body);
				resolve(this.processToken(data))
			}
		})
	})
}

/**
 * 根据refresh token，刷新access token，调用getAccessToken后才有效
 * Examples:
 * ```
 * api.refreshAccessToken(refreshToken);
 * ```
 * Exception:
 *
 * - `err`, 刷新access token出现异常时的异常对象
 *
 * Return:
 * ```
 * {
 *  data: {
 *    "access_token": "ACCESS_TOKEN",
 *    "expires_in": 7200,
 *    "refresh_token": "REFRESH_TOKEN",
 *    "openid": "OPENID",
 *    "scope": "SCOPE"
 *  }
 * }
 * ```
 * @param {String} refreshToken refreshToken
 */
Auth.prototype.refreshAccessToken = function(refreshToken){
	return new Promise((resolve, reject) => {
		const url = 'https://api.weixin.qq.com/sns/oauth2/refresh_token';
		var info = {
		    appid: this.appid,
		    grant_type: 'refresh_token',
		    refresh_token: refreshToken
		};
		request.post(url,{form:info},(err, res, body) => {
			if(err){
				reject(err)
			}else{
				const data = JSON.parse(body);
				resolve(this.processToken(data))
			}
		})
	})
}

/**
 * 根据openid，获取用户信息。
 * 当access token无效时，自动通过refresh token获取新的access token。然后再获取用户信息
 * Examples:
 * ```
 * api.getUser(options);
 * ```
 *
 * Options:
 * ```
 * openId
 * // 或
 * {
 *  "openId": "the open Id", // 必须
 *  "lang": "the lang code" // zh_CN 简体，zh_TW 繁体，en 英语
 * }
 * ```
 * Callback:
 *
 * - `err`, 获取用户信息出现异常时的异常对象
 *
 * Result:
 * ```
 * {
 *  "openid": "OPENID",
 *  "nickname": "NICKNAME",
 *  "sex": "1",
 *  "province": "PROVINCE"
 *  "city": "CITY",
 *  "country": "COUNTRY",
 *  "headimgurl": "http://wx.qlogo.cn/mmopen/g3MonUZtNHkdmzicIlibx6iaFqAc56vxLSUfpb6n5WKSYVY0ChQKkiaJSgQ1dZuTOgvLLrhJbERQQ4eMsv84eavHiaiceqxibJxCfHe/46",
 *  "privilege": [
 *    "PRIVILEGE1"
 *    "PRIVILEGE2"
 *  ]
 * }
 * ```
 * @param {Object|String} options 传入openid或者参见Options
 */
Auth.prototype.getUser = async function(openid){
	const data = this.getToken(openid);
	console.log(data);
	if(!data){
		var error = new Error('No token for ' + options.openid + ', please authorize first.');
		error.name = 'NoOAuthTokenError';
		throw error;
	}
	const token = AccessToken(data);
	var accessToken;
	if(token.isValid()){
		accessToken = token.data.access_token;
	}else{
		var newToken = await this.refreshAccessToken(token.data.refresh_token);
		accessToken = newToken.data.access_token
	}
	return await this._getUser(openid,accessToken);
}

Auth.prototype._getUser = function(openid, accessToken,lang){
	return new Promise((resolve, reject) => {
		const url = "https://api.weixin.qq.com/sns/userinfo";
		const info = {
			access_token:accessToken,
			openid:openid,
			lang:lang||'zh_CN'
		}
		request.post(url,{form:info},(err, res, body) => {
			if(err){
				reject(err)
			}else{
				resolve(JSON.parse(body));
			}
		})
	})
}

/**
 * 根据code，获取用户信息。
 * Examples:
 * ```
 * var user = yield api.getUserByCode(code);
 * ```
 * Exception:
 *
 * - `err`, 获取用户信息出现异常时的异常对象
 *
 * Result:
 * ```
 * {
 *  "openid": "OPENID",
 *  "nickname": "NICKNAME",
 *  "sex": "1",
 *  "province": "PROVINCE"
 *  "city": "CITY",
 *  "country": "COUNTRY",
 *  "headimgurl": "http://wx.qlogo.cn/mmopen/g3MonUZtNHkdmzicIlibx6iaFqAc56vxLSUfpb6n5WKSYVY0ChQKkiaJSgQ1dZuTOgvLLrhJbERQQ4eMsv84eavHiaiceqxibJxCfHe/46",
 *  "privilege": [
 *    "PRIVILEGE1"
 *    "PRIVILEGE2"
 *  ]
 * }
 * ```
 * @param {String} code 授权获取到的code
 */
Auth.prototype.getUserByCode = async function(code){
	const token = await this.getAccessToken(code);
	return await this.getUser(token.data.openid);
}

module.exports = Auth;