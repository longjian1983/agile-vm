(function () {
	var $ = require('JQLite');
	var Updater = require('Updater');
	var Watcher = require('Watcher');

	//指令解析规则，可以通过Parser.add方法添加自定义指令处理规则
	//所有解析规则默认接受四个参数
	/**
	 * @param   {JQLite}  $node       [指令节点]
	 * @param   {Object}  fors        [for别名映射]
	 * @param   {String}  expression  [指令表达式]
	 * @param   {String}  dir         [指令名]
	 */
	var directiveRules = {
		'vtext': function ($node, fors, expression, dir, updateFunc) {

			var parser = this, updater = this.updater;

			var scope = this.$scope;

			var deps = [];

			var exps = expression.split('+');

			$.util.each(exps, function (i, exp) {
				exp = exp.trim();
				//常量不作为依赖
				if (!Parser.isConst(exp)) {
					deps.push(Parser.makePath(exp, fors));
					exps[i] = Parser.makeAliasPath(exp, fors);
				}
			});

			var func = new Function('scope', 'try{ return ' + exps.join('+') + '; }catch(e){return "";}');

			var text = func(scope);

			updateFunc = updateFunc || 'updateTextContent';

			updater[updateFunc]($node, text);

			this.watcher.watch(deps, function (options) {
				text = func(scope);
				updater[updateFunc]($node, text);
			}, fors);
		},
		'vhtml': function ($node, fors, expression, dir) {
			var args = $.util.copyArray(arguments);
			args.push('updateHTMLContent');
			this.vtext.apply(this, args);
		},
		'vfor': function ($node, fors, expression) {

			var parser = this;

			var vforIndex = this.vforIndex++;

			var vm = this.vm, scope = this.$scope, $parent = $node.parent();

			expression = expression.replace(/[ ]+/g, ' ');

			var exps = expression.split(' in '),
				alias = exps[0],
				access = exps[1],
				$access = Parser.makePath(access, fors);

			var array = Parser.getListScope(scope, $access);

			var forsCache = {};

			var $listFragment = parser.preCompileVFor($node, function () {
				return Parser.getListScope(scope, $access);
			}, 0, fors, alias, access, forsCache, vforIndex);

			var isAdapter = $.ui.isJQAdapter($listFragment);

			if (isAdapter) {
				return;
			} else {
				$listFragment.replaceTo($node);
			}

			var deps = [$access], updater = this.updater;

			this.watcher.watch(deps, function (options, i) {

				if (!options.method) {
					options = {
						path: options.path,
						method: 'xReset',
						args: options.newVal,
						newArray: options.newVal
					};
				}

				options.vforIndex = vforIndex;

				var handlerFlag = (i === 0);
				parser.watcher.updateIndex($access, options, function (opts) {
					var cFor = forsCache[opts.newVal] = forsCache[opts.oldVal];
					cFor['$index'] = opts.newVal;
					parser.watcher.change(opts);
				}, handlerFlag);

				updater.updateList($parent, options, function (arr) {
					var baseIndex = Parser.getBaseIndex(options);
					var $listFragment = parser.preCompileVFor($node, function () {
						return arr;
					}, baseIndex, fors, alias, access, forsCache, vforIndex);
					return $listFragment;
				});
			});
		},
		'von': function ($node, fors, expression, dir, isOnce) {
			var parser = this;
			var vm = this.vm, scope = this.$scope;
			var evts = Parser.parseDir(dir, expression);

			$.util.each(evts, function (evt, func) {
				var $access = Parser.makePath(expression, fors);
				var funcStr = Parser.makeAliasPath(expression, fors);
				var argsStr = '';
				funcStr = funcStr.replace(/\((.*)\)/, function (s, s1) {
					/*var args = s1.split(',');
					$.util.each(args, function (i, arg) {
						args[i] = Parser.makeAliasPath($.util.trim(arg), fors);
					});
					argsStr = args.join(',');*/
					argsStr = s1;
					return '';
				});

				var _proxy = function () {
					var params = $.util.copyArray(arguments);
					parser.setDeepScope(fors);
					if (argsStr === '') {
						var func = (new Function('scope', 'node', 'params', 'return '
							+ funcStr + '.apply(node, params);'));
						func(scope, this, params);
					} else {
						var func = (new Function('scope', 'node', '$event', 'return '
							+ funcStr + '.call(node, ' + argsStr + ');'));
						func(scope, this, params.shift());
					}
				};

				$node.each(function () {
					$.util.defRec(this, '_proxy', _proxy);
				});

				if (isOnce) $node.off(evt, Parser._proxy);

				$node.on(evt, Parser._proxy);
			});
		},
		'vone': function ($node, fors, expression, dir) {
			var args = $.util.copyArray(arguments);
			args.push(true);
			this.von.apply(this, args);
		},
		'vbind': function ($node, fors, expression, dir) {
			var parser = this, updater = this.updater;

			var attrs = Parser.parseDir(dir, expression);

			$.util.each(attrs, function (attr, exp) {
				exp = $.util.trim(exp);
				if (attr === 'class' || attr === 'style') {
					parser['v' + attr]($node, fors, exp);
					return;
				}

				updater.updateAttribute($node, attr, parser.getValue(exp, fors));

				var deps = [];
				deps.push(Parser.makePath(exp, fors));

				parser.watcher.watch(deps, function (options) {
					updater.updateAttribute($node, attr, parser.getValue(exp, fors));
				}, fors);
			});
		},
		'vstyle': function ($node, fors, expression) {

			var parser = this, updater = this.updater;

			var $style = parser.getValue(Parser.formatExp(expression));

			//v-style="string"写法，如：v-style="imgStyle"
			if ($.util.isString($style)) {

				var styles = Parser.formatJData(parser.getValue($style, fors)),
					access = Parser.makePath($style, fors);

				updater.updateStyle($node, styles);

				parser.doWatch($node, access, styles, 'updateStyle', $style, fors);

				return;
			}

			//v-style="json"写法，如：v-style="{'color':tColor, 'font-size':fontSize+'dp'}"
			$.util.each($style, function (style, exp) {

				updater.updateStyle($node, style, parser.getValue(exp, fors));

				var deps = [Parser.makePath(exp, fors)];

				parser.watcher.watch(deps, function (options) {
					updater.updateStyle($node, style, parser.getValue(exp, fors));
				}, fors);
			});
		},
		'vclass': function ($node, fors, expression) {
			var parser = this, updater = this.updater;

			var $class = parser.getValue(Parser.formatExp(expression));

			//v-class="string"写法，如：v-class="testClass"
			if ($.util.isString($class)) {

				var oldClass = Parser.formatJData(parser.getValue($class, fors));

				var access = Parser.makePath($class, fors);

				updater.updateClass($node, oldClass);

				parser.doWatch($node, access, oldClass, 'updateClass', $class, fors);

				return;
			}

			//v-class="json"写法，如：v-class="{colorred:cls.colorRed, colorgreen:cls.colorGreen, font30:cls.font30, font60:cls.font60}"
			$.util.each($class, function (cName, exp) {

				updater.updateClass($node, cName, parser.getValue(exp, fors));

				var deps = [Parser.makePath(exp, fors)];

				parser.watcher.watch(deps, function (options) {
					updater.updateClass($node, cName, parser.getValue(exp, fors));
				}, fors);

			});
		},
		'vshow': function ($node, fors, expression) {
			var parser = this, updater = this.updater;

			var defaultValue = $node.css('display')||'';

			updater.updateShowHide($node, defaultValue, parser.getValue(expression, fors));

			var deps = [Parser.makePath(expression, fors)];

			parser.watcher.watch(deps, function (options) {
				updater.updateShowHide($node, defaultValue, parser.getValue(expression, fors));
			}, fors);
		},
		'vif': function ($node, fors, expression) {

			var parser = this, updater = this.updater;

			var preCompile = function($fragment){
				parser.vm.compileSteps($fragment, fors);
			};

			updater.updateMutex($node, parser.getValue(expression, fors), preCompile);

			var deps = [Parser.makePath(expression, fors)];

			parser.watcher.watch(deps, function (options) {
				updater.updateMutex($node, parser.getValue(expression, fors), preCompile);
			}, fors);

		},
		'velse': function ($node, fors, expression) {
			//do nothing
		},
		'vlike': function ($node, fors, expression) {
			$node.data('__like', expression);
		},
		'vmodel': function ($node, fors, expression) {
			var type = $node.data('__like') || $node.elementType();

			switch (type) {
				case 'text':
				case 'password':
				case 'textfield':
				case 'textarea': this.vmtext.apply(this, arguments); return;
				case 'radio': this.vmradio.apply(this, arguments); return;
				case 'checkbox': this.vmcheckbox.apply(this, arguments); return;
				case 'select': this.vmselect.apply(this, arguments); return;
			}

			if (this['vm' + type]) {
				this['vm' + type].apply(this, arguments);
			} else {
				$.util.warn('v-model 不支持 [ ' + type + ' ] 组件');
			}

		},
		'vmtext': function ($node, fors, expression) {
			var parser = this, updater = this.updater;

			var access = Parser.makePath(expression, fors);

			var duplexField = parser.getDuplexField(access), duplex = duplexField.duplex, field = duplexField.field;;

			updater.updateTextValue($node, parser.getValue(expression, fors));

			var deps = [access];
			parser.watcher.watch(deps, function () {
				updater.updateTextValue($node, parser.getValue(expression, fors));
			}, fors);

			Parser.bindTextEvent($node, function () {
				duplex[field] = $node.val();
			});
		},
		'vmradio': function ($node, fors, expression) {
			var parser = this, updater = this.updater;

			var access = Parser.makePath(expression, fors);

			var duplexField = parser.getDuplexField(access), duplex = duplexField.duplex, field = duplexField.field;

			var value = parser.getValue(expression, fors);

			var isChecked = $node.is(':checked');

			// 如果已经定义了默认值
			if (isChecked) {
				duplex[field] = value = Parser.formatValue($node, $node.val());
			}

			updater.updateRadioChecked($node, value);

			var deps = [access];
			parser.watcher.watch(deps, function () {
				updater.updateRadioChecked($node, parser.getValue(expression, fors));
			}, fors);

			Parser.bindChangeEvent($node, function () {
				if (isChecked === $node.is(':checked')) return;
				isChecked = $node.is(':checked');
				duplex[field] = $node.val();
			});
		},
		'vmcheckbox': function ($node, fors, expression) {

			var parser = this, updater = this.updater;

			var access = Parser.makePath(expression, fors);

			var duplexField = parser.getDuplexField(access), duplex = duplexField.duplex, field = duplexField.field;

			var value = parser.getValue(expression, fors);

			var isChecked = $node.is(':checked');

			if (isChecked) {
				if ($.util.isBoolean(value)) {
					duplex[field] = value = true;
				} else if ($.isArray(value)) {
					value.push(Parser.formatValue($node, $node.val()));
				}
			}

			updater.updateCheckboxChecked($node, value);

			var deps = [access];
			parser.watcher.watch(deps, function () {
				updater.updateCheckboxChecked($node, parser.getValue(expression, fors));
			}, fors);

			Parser.bindChangeEvent($node, function () {
				value = duplex[field];

				var $this = $(this);
				var checked = $this.is(':checked');

				if ($.util.isBoolean(value)) {
					duplex[field] = checked;
				} else if ($.isArray(value)) {
					var val = Parser.formatValue($this, $this.val());
					var index = value.indexOf(val);

					// hook
					if (checked) {
						if (index === -1) {
							value.push(val);
						}
					} else {
						if (index > -1) {
							value.splice(index, 1);
						}
					}
				}
			});
		},
		'vmselect': function ($node, fors, expression) {
			var parser = this, updater = this.updater;

			var access = Parser.makePath(expression, fors);

			var duplexField = parser.getDuplexField(access), duplex = duplexField.duplex, field = duplexField.field;

			var isDefined;

			var multi = $node.hasAttr('multiple');

			var value = parser.getValue(expression, fors);

			if ($.util.isString(value)) {
				if (multi) {
					return $.util.warn('<select> 设置的model [' + field + '] 不是数组不能多选');
				}
				isDefined = Boolean(value);
			} else if ($.isArray(value)) {
				if (!multi) {
					return $.util.warn(' <select> 没有 multiple 属性，model [' + field + '] 不可以设置为数组');
				}
				isDefined = value.length > 0;
			} else {
				return $.util.warn('<select>对应的 model [' + field + '] 必须是一个字符串或者数组');
			}

			if (isDefined) {
				updater.updateSelectChecked($node, value, multi);
			} else {
				var selects = Parser.getSelecteds($node);
				duplex[field] = multi ? selects : selects[0];
			}

			var deps = [access];

			parser.watcher.watch(deps, function () {
				updater.updateSelectChecked($node, parser.getValue(expression, fors), multi);
			});

			Parser.bindChangeEvent($node, function () {
				var selects = Parser.getSelecteds($(this));
				duplex[field] = multi ? selects : selects[0];
			});
		},
		'vmnativeselect': function ($node, fors, expression) {
			var parser = this, updater = this.updater;

			var access = Parser.makePath(expression, fors);

			var duplexField = parser.getDuplexField(access), duplex = duplexField.duplex, field = duplexField.field;

			duplex[field] = $node.val();

			var deps = [access];
			parser.watcher.watch(deps, function () {
				$node.val(parser.getValue(expression, fors));
			}, fors);

			Parser.bindChangeEvent($node, function () {
				duplex[field] = $node.val();
			});
		}
	};

	/**
	 * 指令解析器模块
	 * @param  {Compiler}      vm  [Compiler示例对象]
	 */
	var Parser = function (vm) {

		this.vm = vm;

		//初始化for循环索引
		this.vforIndex = 0;

		//获取原始scope
		this.$scope = this.getScope();

		//视图刷新模块
		this.updater = new Updater(this.vm);
		//数据订阅模块
		this.watcher = new Watcher(this, this.vm.$data);

		this.init();
	};

	var pp = Parser.prototype;

	pp.init = function () {
		var parser = this;
		//将指令规则添加到Parser对象中
		$.util.each(directiveRules, function (directive, rule) {
			parser[directive] = function ($node, fors, expression, dir) {
				if (dir) $node.data('__directive', Parser.getDirName(dir));
				parser.setDeepScope(fors);
				rule.apply(parser, arguments);
			};
		});
	};

	/**
	 * 通用watch方法
	 * @param   {JQLite}     $node         [指令节点]
	 * @param   {String}     access        [节点路径]
	 * @param   {Object}     oldValue      [指令值]
	 * @param   {String}     updateFunc    [更新函数]
	 * @param   {Object}     json          [指令真实路径]
	 * @param   {Object}     fors          [for别名映射]
	 */
	pp.doWatch = function ($node, access, oldValue, updateFunc, json, fors) {
		var parser = this, updater = this.updater;
		(function doWatch(deps, adds) {
			parser.watcher.watch(
				adds || deps,
				function (options) {
					var newValue = Parser.formatJData(parser.getValue(json, fors));

					var diff = Parser.getDiff(newValue, oldValue);
					updater[updateFunc]($node, diff);

					var diffDeps = Parser.diffJDeps(deps, access, oldValue = newValue);
					if (diffDeps.length > 0) doWatch(deps, diffDeps);

				}, fors);
		})([access].concat(Parser.getJDeps(access, oldValue)));
	};

	/**
	 * 根据路径获取最后一个键值对的取值域

	 * @param   {String}     access        [节点路径]
	 * @return  {Object}     {duplex: , field:}
	 */
	pp.getDuplexField = function (access) {
		var ac = ('scope.' + access).split('.');
		var field = ac.pop();
		var duplex = ac.join('.');
		var scope = this.$scope;

		var func = new Function('scope', 'return ' + duplex + ';');
		duplex = func(scope);

		return {
			duplex: duplex,
			field: field
		}
	};

	/**
	 * 根据表达式获取真实值
	 * @param   {String}     exp        [表达式]
	 * @param   {Object}     fors       [for别名映射]
	 * @return  {Any}      取决于实际值
	 */
	pp.getValue = function (exp, fors) {
		var args = $.util.copyArray(arguments);
		args.unshift(this.$scope)
		return Parser.getValue.apply(Parser, args);
	};

	/**
	 * watch通用回调处理
	 * 
	 * @param   {Object}       fors        [for别名映射]
	 * @param   {Function}     callback    [回调函数]
	 * @param   {Array}        args        [回调参数]
	 */
	pp.watchBack = function (fors, callback, args) {
		this.setDeepScope(fors);
		callback.apply(this, args);
	};


	/**
	 * vfor预编译处理
	 * 
	 * @param   {JQLite}     $node         [指令节点]
	 * @param   {Function}   getter          [循环数组数据获取函数]
	 * @param   {Number}     baseIndex     [起始索引]
	 * @param   {Object}     fors          [for别名映射]
	 * @param   {String}     alias         [for指令别名]
	 * @param   {String}     access        [节点路径]
	 * @param   {Object}     forsCache     [fors数据缓存]
	 * @param   {Number}     vforIndex     [for索引]
	 * 
	 */
	pp.preCompileVFor = function ($node, getter, baseIndex, fors, alias, access, forsCache, vforIndex) {

		var parser = this, vm = this.vm;

		var $parent = $node.parent();

		//List适配器组件独立编译
		if ($.ui.useAdapter($node)) {
			var $adapter = $parent.attr('adapter');
			//编译每一个cell，直到编译结束初始化adapter事件监听
			if (!$adapter.setCell($node)) return $adapter;
			//初始化adpater事件监听
			$adapter.initEvent($parent, $node, getter, function ($plate, position, newArr) {
				parser.buildAdapterList($plate, newArr, position, fors, alias, access, forsCache, vforIndex);
			});
			//刷新适配器
			$.ui.refreshDom($adapter);

			return $adapter;
		}

		return parser.buildList($node, getter(), baseIndex, fors, alias, access, forsCache, vforIndex);
	};

	/**
	 * adpater数据处理
	 * 
	 * @param   {JQLite}     $node         [指令节点]
	 * @param   {Array}      array         [循环数组数据]
	 * @param   {Number}     position      [当前处理数据索引]
	 * @param   {Object}     fors          [for别名映射]
	 * @param   {String}     alias         [for指令别名]
	 * @param   {String}     access        [节点路径]
	 * @param   {Object}     forsCache     [fors数据缓存]
	 * @param   {Number}     vforIndex     [for索引]
	 * 
	 */
	pp.buildAdapterList = function ($node, array, position, fors, alias, access, forsCache, vforIndex) {
		var cFors = forsCache[position] = Parser.createFors(fors, alias, access, position, false);
		var $plate = $node.data('vforIndex', vforIndex);
		this.$scope['$alias'][alias] = array[position];
		this.vm.compileSteps($plate, cFors);
	};

	/**
	 * 通用循环处理
	 * 
	 * @param   {JQLite}     $node         [指令节点]
	 * @param   {Array}      array         [循环数组数据]
	 * @param   {Number}     baseIndex     [起始索引]
	 * @param   {Object}     fors          [for别名映射]
	 * @param   {String}     alias         [for指令别名]
	 * @param   {String}     access        [节点路径]
	 * @param   {Object}     forsCache     [fors数据缓存]
	 * @param   {Number}     vforIndex     [for索引]
	 * 
	 */
	pp.buildList = function ($node, array, baseIndex, fors, alias, access, forsCache, vforIndex) {
		var $listFragment = $.ui.createJQFragment();

		$.util.each(array, function (i, item) {
			var ni = baseIndex + i;
			var cFors = forsCache[ni] = Parser.createFors(fors, alias, access, ni);
			var $plate = $node.clone(true).data('vforIndex', vforIndex);
			this.setDeepScope(cFors);
			this.vm.compileSteps($plate, cFors);
			$listFragment.append($plate);
		}, this);

		return $listFragment;
	};

	/**
	 * 深度设置$alias别名映射
	 * @param   {Object}     fors          [for别名映射]
	 */
	pp.setDeepScope = function (fors, isParent) {
		if (!fors) return;
		var scope = this.$scope, str$alias = '$alias';
		var alias = fors.alias,
			access = fors.access,
			$access = Parser.makePath(access, fors),
			$index = fors.$index,
			ignor = fors.ignor;
		if (ignor) return this.setDeepScope(fors.fors);
		var func = new Function('scope', 'return scope.' + $access.replace(/\.(\d+)/g, function (s, s1) {
			return '[' + s1 + ']'
		}) + '[' + $index + '];');
		scope[str$alias][alias] = func(scope);
		if(!isParent) scope[str$alias]['$index'] = $index;
		if($.util.isNumber($index)) isParent = true;
		this.setDeepScope(fors.fors, isParent);
	};

	//创建scope数据
	pp.getScope = function () {
		return Object.create(this.vm.$data);
	};

	/**
	 * 添加指令规则
	 * @param   {Object|String}     directive       [当只有一个参数是代表是指令规则键值对，两个参数的时候代表指令名]
	 * @param   {Function}          func            [指令解析函数]
	 */
	Parser.add = function (directive, func) {
		var obj = {};
		$.util.isObject(directive) ? (obj = directive) : (obj[directive] = func);
		$.util.each(obj, function (d, f) {
			directiveRules[d] = f;
		});
	};

	Parser._proxy = function () {
		var _proxy = this._proxy;
		_proxy.apply(this, arguments);
	};

	//获取指令名v-on:click -> v-on
	Parser.getDirName = function (dir) {
		return dir.split(':')[0];
	};

	//字符串是否是常量表示
	Parser.isConst = function (str) {
		str = $.util.trim(str);
		strs = str.split('');
		var start = strs.shift() || '', end = strs.pop() || '';
		str = (start === '(' ? '' : start) + strs.join('') + (end === ')' ? '' : end);
		if (this.isBool(str) || this.isNum(str)) return true;
		var CONST_RE = /('[^']*'|"[^"]*")/;
		return CONST_RE.test(str);
	};

	//字符串是否是boolean型表示
	Parser.isBool = function (str) {
		return str === 'true' || str === 'false';
	};

	//字符串是否是数字表示
	Parser.isNum = function (str) {
		return /^\d+$/.test(str);
	};

	//字符串是否是JSON对象表示
	Parser.isJSON = function (str) {
		strs = str.split('');
		var start = strs.shift(), end = strs.pop();
		return start === '{' && end === '}' ? strs.join('') : '';
	};

	//格式化指令表达式，将值添加引号 字符串->'字符串'，{key:value}->{key:'value'}
	Parser.formatExp = function (exp) {
		var content = this.isJSON(exp);
		if (content) {
			var group = content.split(',');
			$.util.each(group, function (i, s) {
				var ss = s.split(':');
				ss[1] = "'" + ss[1].replace(/'/g, '"') + "'";
				group[i] = ss.join(':');
			});
			return '{' + group.join(',') + '}';
		} else {
			return "'" + exp + "'";
		}
	};

	//获取指令表达式的真实路径
	Parser.makePath = function (exp, fors) {
		var NOT_AVIR_RE = /[^\w\.\[\$]/g
		exp = exp.replace(NOT_AVIR_RE, '').replace(/\[/g, '.');

		var exps = exp.split('.');

		$.util.each(exps, function (i, exp) {
			if (exp === '$index') {
				exps[i] = fors.access + '.' + fors.$index + '.*';
			} else {
				exps[i] = Parser.findScope(exp, fors);
			}
		});

		return exps.join('.');
	};

	//深度查找指令表达式的别名对应的真实路径
	Parser.findScope = function (exp, fors) {
		if (!fors) return exp;

		var alias = fors.alias;
		var access = fors.access;
		var $index = fors.$index;

		if (alias === exp) {
			return access + '.' + $index;
		}

		return Parser.findScope(exp, fors.fors);
	};

	//获取指令表达式的别名路径
	Parser.makeAliasPath = function (exp, fors) {
		//li.pid==item.pid
		//$index
		//obj.title
		//$index>0
		exp = exp.replace(/([^\w \.'"\/])[ ]*([\w]+)/g, function(s, s1, s2){

			s = s1+s2;

			if(s === '$event'||Parser.isConst(s2)){
				return s;
			}

			if(s==='$index'){
				return 'scope.$alias.'+s;
			}
			
			if(Parser.hasAlias(s2, fors)){
				return s1+'scope.$alias.'+s2;
			}else{
				return s1+'scope.'+s2;
			}
		});
		var exps = exp.split('.');
		exps[0] = /^['"\/].*$/.test(exps[0])?exps[0]:exps[0].replace(/[\w\$]+/,
			function (s) {
				if (Parser.isConst(s) || s === '$event' || s==='scope') {
					return s;
				}

				if (s === '$index' || Parser.hasAlias(s, fors)) {
					s = '$alias.' + s;
				}
				return 'scope.' + s;
			});
		exp = exps.join('.');

		return exp;
	};

	//表达式中是否包含别名
	Parser.hasAlias = function (exp, fors) {
		if (!fors) return false;

		if (exp === fors.alias) return true;

		return this.hasAlias(exp, fors.fors);
	};

	//为vfor路径获取scope数据
	Parser.getListScope = function (obj, path) {
		var func = new Function(
			'scope', 'return scope.' +
			path.replace(/\.(\d+)/g, function (s, s1) {
				return '[' + s1 + ']';
			}) +
			';'
		);
		return func(obj);
	};

	//创建fors数据，内容为别名依赖
	Parser.createFors = function (fors, alias, access, index, ignor) {
		return {
			alias: alias,
			access: access,
			fors: fors,
			$index: index,
			ignor: ignor
		}
	};

	//为数组操作获取要操作的基础索引号
	Parser.getBaseIndex = function (options) {
		var method = options.method;
		switch (method) {
			case 'push':
				return options.oldLen;
			case 'splice':
				return options.args[0];
			default:
				return 0;
		}
	};

	//根据数组路径获取数组操作的索引号
	Parser.getIndex = function (options) {
		var $index = -1;
		var path = options.path;
		path.replace(/\.(\d+)\.\*/g, function (s, s1) {
			$index = options.newVal;
		});
		return $index;
	};

	//解析指令的前后缀
	Parser.parseDir = function (dir, exp) {
		var dirs = dir.split(':');
		var kv = {};
		if (dirs.length === 1) {
			kv = JSON.stringify(exp);
		} else if (dirs.length === 2) {
			kv[dirs[1]] = exp;
		}
		return kv;
	};

	//取值函数创建
	Parser.makeFunc = function (str) {
		return new Function('scope', 'try{ return ' + str + '; }catch(e){return "";}');
	};

	//根据表达式取值
	Parser.getValue = function (scope, str, fors) {
		if (arguments.length > 2) {
			str = this.makeAliasPath(str, fors);
		}
		var func = this.makeFunc(str);
		return func(scope);
	};

	//如果指令值为数字则强制转换格式为数字
	Parser.formatValue = function ($node, value) {
		return $node.hasAttr('number') ? +value : value;
	};

	//获取select组件的取值
	Parser.getSelecteds = function ($select) {
		var sels = [];
		var getNumber = $select.hasAttr('number');
		$select.find("option:selected").each(function () {
			var $option = $(this);
			var value = $option.val();
			sels.push(getNumber ? +value : Parser.formatValue($option, value));
		});

		return sels;
	};

	//文本输入框的事件监听处理
	Parser.bindTextEvent = function ($node, callbacl) {

		var composeLock;

		// 解决中文输入时 input 事件在未选择词组时的触发问题
		// https://developer.mozilla.org/zh-CN/docs/Web/Events/compositionstart
		$node.on('compositionstart', function () {
			composeLock = true;
		});
		$node.on('compositionend', function () {
			composeLock = false;
		});

		// input 事件(实时触发)
		$node.on('input', function () {
			callbacl.apply(this, arguments);
		});

		// change 事件(失去焦点触发)
		$node.on('blur', function () {
			callbacl.apply(this, arguments);
		});
	};

	//通用change事件监听处理。比如：radio、checkbox、select等
	Parser.bindChangeEvent = function ($node, callback) {
		$node.on('change', function () {
			callback.apply(this, arguments);
		});
	};

	//获取指令值为json数据的依赖，仅针对指令取值后为json格式的指令解析	
	Parser.getJDeps = function (access, kvs) {
		var deps = [];
		$.util.each(kvs, function (name, val) {
			deps.push(access + '.' + name);
		});
		return deps;
	};

	//获取指令值是否有变化，并返回变化值，仅针对指令取值后为json格式的指令解析	
	Parser.diffJDeps = function (deps, access, kvs) {
		var diffs = {
			o: [],
			n: []
		};
		$.util.each(kvs, function (name, val) {
			var _access = access + '.' + name;
			if (deps.indexOf(_access) === -1) {
				diffs.n.push(_access);
				deps.push(_access);
			} else {
				diffs.o.push(_access);
			}
		});
		return diffs;
	};

	//获取指令值是否有变化，并返回变化值，仅针对指令取值后为json格式的指令解析	
	Parser.formatJData = function (str) {
		if ($.util.isString(str)) {
			var attrs = {};
			$.util.each(str.split(/[ ;]/), function (i, name) {
				name = $.util.trim(name);
				if (!name) return;
				var attr = name.split(':');
				if (attr.length > 1) {
					attrs[attr[0]] = attr[1];
				} else {
					attrs[name] = true;
				}
			});
			return attrs;
		} else {
			return $.util.copy(str);
		}
	};

	//获取两个对象的差异
	Parser.getDiff = function (newObj, oldObj) {
		var diff = {};
		$.util.each(newObj, function (k, v) {
			if (oldObj[k] !== v) {
				diff[k] = v;
			}
		});
		$.util.each(oldObj, function (k, v) {
			if (typeof newObj[k] === 'undefined') diff[k] = null;
		});
		return diff;
	};


	module.exports = Parser;
})();