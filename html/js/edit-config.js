var config_fn, tree_fn;
var speaku, config, config_data, orig_tree_data, tree_data, voices, napi;
// start
Promise.all([
  window.cordova ? NativeAccessApi.onready() : Promise.resolve(),
  new Promise(function(resolve) { // domready
    document.addEventListener('DOMContentLoaded', function() {
      document.removeEventListener('DOMContentLoaded', arguments.callee, false);
      resolve();
    }, false);
  })
])
  .then(initialize_app)
  .then(function() {
    config_fn = default_config;
    tree_fn = default_tree;
    napi = new NativeAccessApi();
    speaku = new SpeakUnit(napi);
    return speaku.init()
      .then(function() {
        return speaku.get_voices().then(function(v) { voices = v })
      });
  })
  // load
  .then(function() {
    return get_file_json(config_fn)
      .then(function(_config) {
        config = _config;
        config_data = JSON.stringify(config);
        _fix_config(config);
      });
  })
  .then(function() {
    return Promise.all([
      initl10n(config.locale||default_locale)
        .then(function() {
          domlocalize();
        })
        .catch(function(err) {
          console.warn(err);
        }),
      get_file_data(config.tree||tree_fn)
        .then(function(_data) { tree_data = _data; orig_tree_data = _data; })
    ]);
  })
  .then(function() {
    // display body
    document.body.style.display = '';
  })
  .then(start)
  .catch(handle_error);

function _fix_config(cfg) {
  if(!cfg.auditory_cue_first_run_voice_options &&
     !cfg._auditory_cue_first_run_voice_options) {
    cfg._auditory_cue_first_run_voice_options =  {
      "volume": 1.0,
      "rate": "default",
      "rateMul": 1.5,
      "pitch": 1.0
    };
  }
}

function start() {
  // insert voice options
  var $form = $('form[name=edit-config]').first(),
      voices_by_id = _.object(_.map(voices, function(voice) { return [voice.id,voice] }));
  _.each(_voice_id_links, function(alink) {
    var $wrp = $(alink[2]),
        text = "Quiet people have the loudest minds. Pasco at your service.";
    $wrp.find('.play-btn').click(function() {
      $wrp.find('.play-btn').addClass('hide');
      $wrp.find('.stop-btn').removeClass('hide');
      var opts = {}, $inp;
      $inp = $form.find('[name='+alink[1]+']');
      if($inp.length > 0 && $inp.val())
        opts.voiceId = $inp.val();
      $inp = $form.find('[name="'+alink[0]+'.volume"]');
      if($inp.length > 0 && parseFloat($inp.val()) >= 0)
        opts.volume = parseFloat($inp.val());
      opts.rate = "default";
      $inp = $form.find('[name="'+alink[0]+'.rateMul"]');
      if($inp.length > 0 && parseFloat($inp.val()) > 0)
        opts.rateMul = parseFloat($inp.val());
      $inp = $form.find('[name="'+alink[0]+'.pitch"]');
      if($inp.length > 0 && !isNaN(parseFloat($inp.val())))
        opts.pitch = parseFloat($inp.val())
      $inp = $form.find('[name="'+alink[0]+'.delay"]');
      if($inp.length > 0  && parseFloat($inp.val()) >= 0)
        opts.delay = parseFloat($inp.val());
      speaku.simple_speak(text, opts)
        .then(function(){
          $wrp.find('.play-btn').removeClass('hide');
          $wrp.find('.stop-btn').addClass('hide');
        });
    });
    $wrp.find('.stop-btn').click(function() {
      $wrp.find('.play-btn').removeClass('hide');
      $wrp.find('.stop-btn').addClass('hide');
      speaku.stop_speaking();
    });
    var $inp = $form.find('[name='+alink[1]+']');
    var opt = newEl('option')
    opt.value = ''
    opt.textContent = 'Default'
    $inp.append(opt)
    _.each(voices, function(voice) {
      var opt = newEl('option')
      opt.value = voice.id
      opt.textContent = voice.label
      $inp.append(opt)
    });
  });
  $('#locale-select').on('change', function() {
    var locale = this.value||default_locale;
    initl10n(locale)
      .then(function() {
        domlocalize();
        config.locale = locale;
      })
      .catch(function(err) {
        console.warn(err);
      });
  });
  
  insert_config()
  insert_tree_data()

  $('#tree-file').on('change', function() {
    if(this.files && this.files.length > 0) {
      var reader = new FileReader();
      reader.onload = function() {
        tree_data = reader.result
        $('form[name=edit-tree] [name=tree-input]').val(tree_data)
      }
      reader.readAsText(this.files[0]);
    }
  });
  $('#tree-revert').on('click', function() {
    tree_data = orig_tree_data
    $('form[name=edit-tree] [name=tree-input]').val(tree_data);
  });
  
  config_auto_save_init();
  $('form[name=edit-config]').on('submit', save_config)
  $('form[name=edit-tree]').on('submit', save_tree)
  
  update_tree_default_select();
  $('#tree-default-select').on('change', update_tree_default_select);
  function update_tree_default_select() {
    var value = $('#tree-default-select').val();
    $('#tree-default-select-load-btn').prop('disabled', !value);
  }
  $('#tree-default-select-load-btn').on('click', function() {
    var locale = config.locale || default_locale;
    var name = $('#tree-default-select').val();
    if(!name) {
      alert("Nothing selected!");
    } else {
      read_file('trees/' + locale + '-' + name + '.md')
        .then(change_tree)
        .catch(function(err) {
          if(default_locale == locale)
            throw err;
          return read_file('trees/' + default_locale + '-' + name + '.md')
            .then(change_tree)
            .catch(function() { throw err; });
        })
          .catch(handle_error);
    }
    function change_tree(data) {
      tree_data = data
      $('form[name=edit-tree] [name=tree-input]').val(tree_data)
    }
  });
}

function validate_number(v, name) {
  var ret = parseFloat(v)
  if(isNaN(ret))
    throw new Error(name + " should be a number");
  return ret;
}
var config_validators = {
  'number': validate_number
};
var _voice_id_links = [
  [ 'auditory_main_voice_options', '_main_voice_id', '#auditory-main-playback-wrp' ],
  [ 'auditory_cue_voice_options', '_cue_voice_id', '#auditory-cue-playback-wrp' ],
  [ 'auditory_cue_first_run_voice_options', '_cue_first_run_voice_id', '#auditory-cue-first-run-playback-wrp' ],
]; 

function insert_config() {
  var $form = $('form[name=edit-config]').first()
  $form.find('input,select,textarea,radio,checkbox').each(function() {
    if(this.name.length > 0 && this.name[0] != '_') {
      var name = this.name;
      var path = name.split('.');
      // special case for voice_options, load prefixed data if not avail
      var vo_suffix = 'voice_options';
      if(path[0].indexOf(vo_suffix) == path[0].length - vo_suffix.length) {
        if(!config[path[0]] && config['_'+path[0]]) {
          name = '_' + name;
        }
      }
      var input_info = _input_info_parse(name, config);
      if(input_info.value != undefined)
        _input_set_from_config(this, input_info.value);
    }
  });
  // specific
  if(config.auto_keys) {
    var forward_key = (config.auto_keys['13'] &&
                       config.auto_keys['13'].func == 'tree_go_in' ? 'enter' :
                       (config.auto_keys['32'] &&
                        config.auto_keys['32'].func == 'tree_go_in' ? 'space':
                        null))
    $form.find('[name=_auto_forward_key]').each(function() {
      this.checked = this.value == forward_key
    })
  }
  if(config.switch_keys) {
    var forward_key = (config.switch_keys['13'] &&
                       config.switch_keys['13'].func == 'tree_go_in'?'enter':
                       (config.switch_keys['32'] &&
                        config.switch_keys['32'].func == 'tree_go_in'?'space':
                        null))
    $form.find('[name=_switch_forward_key]').each(function() {
      this.checked = this.value == forward_key
    })
  }
  _.each(_voice_id_links, function(alink) {
    var propname = (speaku.is_native ? '' : 'alt_') + 'voiceId',
        part = config[alink[0]] || config['_' + alink[0]],
        vid = part ? part[propname] : null;
    $form.find('[name='+alink[1]+']').val(vid || '')
  });
  $form.find('[name=_cue_first_active]')
    .prop('checked', !!config.auditory_cue_first_run_voice_options)
    .trigger('change');
}

function insert_tree_data() {
  var $form = $('form[name=edit-tree]').first()
  $form.find('[name=tree-input]').val(tree_data)
}

function save_config(evt) {
  if(evt)
    evt.preventDefault();
  var $form = $('form[name=edit-config]').first()
  var _config = JSON.parse(config_data);
  // validate & apply input
  try {
    $form.find('input,select,textarea').each(function() {
      if(this.name.length > 0 && this.name[0] != '_') {
        var validator_attr = this.getAttribute('data-validator'),
            validator = validator_attr ? config_validators[validator_attr] : null;
        if(validator_attr && !validator)
          throw new Error("Validator not found " + validator_attr + " for " + this.name);
        var value = validator ? validator(this.value, this.name) : this.value;
        var input_info = _input_info_parse(this.name, _config);
        _input_info_set_config_value(this, input_info, value);
      }
    });
    // specific
    var $inp = $form.find('[name=_auto_forward_key]:checked'),
        keys = null;
    switch($inp.val()) {
    case 'enter':
      keys = {
        '32': { 'func': 'tree_go_out', 'comment': 'space' },
        '13': { 'func': 'tree_go_in', 'comment': 'enter' }
      }
      break;
    case 'space':
      keys = {
        '32': { 'func': 'tree_go_in', 'comment': 'space' },
        '13': { 'func': 'tree_go_out', 'comment': 'enter' }
      }
      break;
    }
    if(keys)
      _config.auto_keys = Object.assign((_config.auto_keys || {}), keys);
    $inp = $form.find('[name=_switch_forward_key]:checked');
    keys = null;
    switch($inp.val()) {
    case 'enter':
      keys = {
        '32': { 'func': 'tree_go_out', 'comment': 'space' },
        '13': { 'func': 'tree_go_in', 'comment': 'enter' }
      }
      break;
    case 'space':
      keys = {
        '32': { 'func': 'tree_go_in', 'comment': 'space' },
        '13': { 'func': 'tree_go_out', 'comment': 'enter' }
      }
      break;
    }
    if(keys)
      _config.switch_keys = Object.assign((_config.switch_keys || {}), keys);
    _.each(_voice_id_links, function(alink) {
      var propname = (speaku.is_native ? '' : 'alt_') + 'voiceId',
          str = $form.find('[name='+alink[1]+']').val();
      if(!_config[alink[0]])
        _config[alink[0]] = {}
      if(str)
        _config[alink[0]][propname] = str
      else
        delete _config[alink[0]][propname]
    });
    if(!$form.find('[name=_cue_first_active]').prop('checked')) {
      _config._auditory_cue_first_run_voice_options =
        _config.auditory_cue_first_run_voice_options;
      delete _config.auditory_cue_first_run_voice_options;
    } else {
      delete _config._auditory_cue_first_run_voice_options;
    }
  } catch(err) {
    update_config_alert(false, err);
    return;
  }
  // then save
  // console.log(_config)
  set_file_data(config_fn, JSON.stringify(_config, null, "  "))
    .then(function() {
      config = _config
      update_config_alert(true);
    })
    .catch(function(err) {
      update_config_alert(false, err);
    });
}

function update_config_alert(success, err) {
  var $form = $('form[name=edit-config]').first();
  if($form[0].__config_alert_timeout)
    clearTimeout($form[0].__config_alert_timeout);
  $form.find('.config-success-alert').toggleClass('visible', success);
  $form.find('.config-danger-alert').toggleClass('visible', !success);
  if(success) {
    $form.find('.save-section .alert-success')
      .html('<strong>Success!</strong>')
      .toggleClass('alert-hidden', false);
  } else {
    $form.find('.save-section .alert-danger')
      .html(error_to_html(err))
      .toggleClass('alert-hidden', false);
  }
  $form[0].__config_alert_timeout = setTimeout(function() {
    $form.find('.config-success-alert').toggleClass('visible', false);
    $form.find('.config-danger-alert').toggleClass('visible', false);
    $form[0].__config_alert_timeout = setTimeout(function() {
      $form.find('.save-section .alert-success').html('')
        .toggleClass('alert-hidden', true);
      $form.find('.save-section .alert-danger').html('')
        .toggleClass('alert-hidden', true);
      delete $form[0].__config_alert_timeout;
    }, 510);
  }, 3000);
}

function config_auto_save_init() {
  var $form = $('form[name=edit-config]').first()
  if($form[0].__autosave_timeout)
    $form[0].__autosave_timeout
  $form.on('input', 'input', onchange);
  $form.on('change', 'select,input[type=checkbox],input[type=radio]', onchange);
  function onchange() {
    start_countdown();
  }
  function start_countdown() {
    if($form[0].__autosave_timeout)
      clearTimeout($form[0].__autosave_timeout);
    $form[0].__autosave_timeout = setTimeout(function() {
      $form.find('button[type=submit]').first().click();
      delete $form[0].__autosave_timeout;
    }, 2000);
  }
}

function save_tree(evt) {
  evt.preventDefault();
  var $form = $('form[name=edit-tree]').first()
  // validate & apply input
  tree_data = $form.find('[name=tree-input]').val()
  // then save
  $form.find('.save-section .alert').html('').toggleClass('alert-hidden', true)
  set_file_data(tree_fn, tree_data)
    .then(function() {
      $form.find('.save-section .alert-success')
        .html('<strong>Success!</strong>')
        .toggleClass('alert-hidden', false);
    })
    .catch(function(err) {
      $form.find('.save-section .alert-danger')
        .html(error_to_html(err))
        .toggleClass('alert-hidden', false);
    });
}

function error_to_html(err) {
  return '<strong>Error:</strong> ' + (err+'').replace(/^error:\s*/i, "")
}

// basic editing features (driven with markup)
$(document).on('change', 'input[type=checkbox],input[type=radio]', function() {
  var el = this,
      $el = $(el);
  if(this.type == 'radio' && !this._others_triggered) {
    // trigger change for all with same name
    $el.parents('form').find('input[type=radio]').each(function() {
      if(this.name == el.name && el != this) {
        this._others_triggered = true;
        $(this).trigger('change');
        delete this._others_triggered;
      }
    });
  }
  var toggle_sel = $el.data('inp-collapse-toggle');
  if(toggle_sel) {
    var toggle_el = document.querySelector(toggle_sel);
    if(toggle_el) {
      collapsable_toggle(toggle_el, this.checked);
    }
  }
});

function _input_set_from_config(element, value) {
  if(['radio','checkbox'].indexOf(element.type) != -1) {
    if(element.type == 'checkbox' && typeof value == 'boolean') {
      element.checked = value;
    } else {
      element.checked = element.value == value+'';
    }
    $(element).trigger('change');
  } else {
    element.value = value+'';
  }
}
function _input_info_set_config_value(element, info, value) {
  if(element.type == 'checkbox') {
    if(!element.value || element.value.toLowerCase() == 'on') {
      // is boolean
      info.target[info.name] = element.checked
    } else {
      if(element.checked)
        info.target[info.name] = value
      else
        delete info.target[info.name]
    }
  } else if(element.type == 'radio') {
    if(element.checked) {
      info.target[info.name] = value
    }
  } else {
    info.target[info.name] = value;
  }
}
function _input_info_parse(name, config) {
  var path = name.split('.');
  var value, target, name;
  var tmp = config;
  for(var i = 0, len = path.length; i < len; ++i) {
    var key = path[i];
    if(i + 1 == len) {
      target = tmp;
      value = tmp[key];
      name = key;
    } else {
      if(tmp[key] == null)
        tmp[key] = {}; // make an object, simple solution
      tmp = tmp[key]
    }
  }
  return {
    path: path,
    target: target,
    name: name,
    value: value
  };
}
