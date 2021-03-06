(function(){

	var _$ = require('jQuery'), JQLite = _$, jqlite = JQLite;

	jqlite.fn.extend({
		childs : function(){
			var el = this[0]||{};
			
			var children = jqlite.util.copyArray(el.tagName==='select'?el.options:el.childNodes);

			if(arguments.length>0){
				return jqlite(children.length===0?[]:[children[arguments[0]]]);
			}else{
				return jqlite(children);
			}
		},
		textContent : function(){
			var content = arguments[0], el = this[0]||{};
			if(arguments.length===0){
				return el.textContent;
			}else{
				this.each(function(){
					this.textContent = content;
				});
				return this;
			}
		},
		attrs : function(){
			var el = this[0]||{};
			var arr = [];
			jqlite.util.each(el.attributes, function(i, attr){
				arr.push(attr);
			});
			return arr;
		},
		hasAttr : function (name) {
			return this.length>0&&this[0].hasAttribute(name);
		},
		isElement : function(){
			return this.length>0&&this[0].nodeType===1;
		},
		elementType : function(){
			var type, el = this[0]||{}, nodeType = el.nodeType;
			if(nodeType===1){
				var tagName = el.tagName.toLowerCase();
				if(tagName==='input'){
					type = el.type;
				}else{
					type = tagName;
				}
			}else if(nodeType===3){
				type = '#text';
			}else{
				type = nodeType;
			}
			return type;
		},
		replaceTo : function(el){
			var $el = jqlite(el);
			var $this = this;
			$el.replaceWith(this);
			return this;
		},
		render : function(data){
			jqlite.vm(this, data);
			return this;
		}
	});


	var toString = Object.prototype.toString,
        hasOwn = Object.prototype.hasOwnProperty,
		cons = window.console,
		consoleLevel = ['error', 'warn', 'log'],
		_cons = function(type, args){
			if(consoleLevel.indexOf(jqlite.util.consoleLevel)<consoleLevel.indexOf(type)) return;
			if (cons) cons[type].apply(cons, args);
		};


	jqlite.util = {
		consoleLevel : 'error',
		each : function(obj, callback, context){
			if(!obj) return;
			var ret;
			if(jqlite.isArray(obj)||(!jqlite.util.isString(obj)&&jqlite.util.isNotNaNNumber(obj.length))){			
				for(var i=0;i<obj.length;i++){
					ret = callback.call(context, i, obj[i]);
					if(ret === false) {
						break;
					}else if(ret === null) {
						obj.splice(i, 1);
						i--;
					}
				}
			}else if(jqlite.util.isObject(obj)){
				for(var k in obj){
					ret = callback.call(context, k, obj[k]);
					if(ret === false) {
						break;
					}else if(ret === null) {
						delete obj[k];
					}
				}
			}/*else{
				callback.call(context, 0, obj);
			}*/
		},
		isString : function (str) {
			return jqlite.type(str)==='string';
		},
		isBoolean : function (bool) {
			return jqlite.type(bool)==='boolean';
		},
		isNumber : function (num) {
			return jqlite.type(num)==='number';
		},
		isNotNaNNumber : function (num) {
			return !isNaN(num)&&this.isNumber(num);
		},
		isObject : function(obj) {
			return jqlite.type(obj)==='object';
		},
		isEvent : function(e){
			return e instanceof Event;
		},
		clearObject : function (object) {
			jqlite.util.each(object, function () {
				return null;
			});
		},
		trim : function(str){ //删除左右两端的空格
　　    	return str.replace(/(^\s*)|(\s*$)/g, "");
　　 	  },
		removeSpace : function (string) {
			return (string||'').replace(/\s/g, '');
		},
		hasOwn : function (obj, key) {
			return obj && hasOwn.call(obj, key);
		},
		copy : function (target) {
			var ret;

			if (jqlite.isArray(target)) {
				ret = target.slice(0);
			} else if (this.isObject(target)) {
				ret = jqlite.extend(true, {}, target);
			}

			return ret || target;
		},
		defObj : function(o, a, getter, setter){
			var options = {};
			if(getter){
				options.get = function(){
					return getter.apply(this);
				};
			}
			if(setter){
				options.set = function(){
					setter.apply(this, arguments);
				};
			}

			Object.defineProperty(o, String(a), options);
		},
		defRec : function (object, property, value) {
			return Object.defineProperty(object, property, {
				'value'       : value,
				'writable'    : true,
				'enumerable'  : false,
				'configurable': true
			});
		},
		copyArray : function(arr){
			return Array.prototype.slice.call(arr||[], 0);
		},
		log : function(){
			_cons('log', arguments);
		},
		warn : function () {
			_cons('warn', arguments);
		},
		error : function () {
			_cons('error', arguments);
		},
		paramTransForm : function(param){
			if(this.isObject(param)){//如果param是Object则转为键值对参数
				var rs = [];
				this.each(param, function(k, v){
					rs.push(k+'='+v);
				});
				return rs.join('&');
			}else{//如果参数是键值对则转为Object
				var reg = /([^&=]+)=([\w\W]*?)(&|$|#)/g, rs = {}, result;
				while ((result = reg.exec(param)) != null) {
					rs[result[1]] = result[2];
				}
				return rs;
			}
		}
	};
	
	//继承JQLite的特殊类，用于文档碎片的存储
	var JQFragment = function(){
		return jqlite(arguments.length==0?document.createDocumentFragment():arguments[0]);
	};
	

	jqlite.ui = {
		isJQLite : function(o){
			return o instanceof JQLite;
		},
		useAdapter : function(){
			return false;
		},
		isJQAdapter : function(){
			return false;
		},
		createJQFragment : function(){
			return new JQFragment();
		},
		toJQFragment : function($el){
			var $fragment = this.createJQFragment();

			if($el instanceof JQLite){
				$el.childs().each(function(){
					$fragment.append(this);
					return null;
				});
			}else if(typeof $el==='object'){
				jqlite.util.each(jqlite.util.copyArray($el.childNodes), function(i, child){
					$fragment.append(child);
					return null;
				});
			}else if (/<[^>]+>/g.test($el)) {
				var div = document.createElement('div');
				div.innerHTML = $el;
				jqlite.util.each(jqlite.util.copyArray(div.childNodes), function(i, child){
					$fragment.append(child);
					return null;
				});
			}else {
				$fragment.append(document.createTextNode($el));
			}

			return $fragment;
		}
	};

	jqlite.JSON = {
		parse : function(str){
			return JSON.parse(str)||{};
		},
		stringify: function(){
			return JSON.stringify(str)||'';
		}
	};

	
	jqlite.vm = function(el, data){
		var MVVM = require('MVVM');
		return new MVVM(el, data);
	};

	module.exports = jqlite;

	window.JQLite = jqlite;

	if(!window.$){
		window.$ = jqlite;
	}
	if(!window.jQuery){
		window.jQuery = jqlite;
	}

	var _template = require('template');
	jqlite.template = _template;
	
})();