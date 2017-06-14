var config_fn = default_config, tree_fn = default_tree;
var speaku, config, config_data, orig_tree_data, tree_data, voices;
// start
Promise.all([
  NativeAccessApi.onready(),
  new Promise(function(resolve) { // domready
    document.addEventListener('DOMContentLoaded', function() {
      document.removeEventListener('DOMContentLoaded', arguments.callee, false);
      resolve();
    }, false);
  })
])
  .then(function() {
    speaku = new SpeakUnit()
    return speaku.init()
  })
  .then(function() {
    return speaku.get_voices().then(function(v) { voices = v })
  })
  // load data
  .then(function() {
    return read_json(config_fn)
      .then(function(_config) { config = _config; config_data = JSON.stringify(config) });
  })
  .then(function() {
    return read_file(tree_fn)
      .then(function(_data) { tree_data = _data; orig_tree_data = _data; });
  })
  .then(start);

function start() {
  // insert voice options
  var $form = $('form[name=edit-config]').first()
  _.each(['_voice_id', '_cue_voice_id'], function(name) {
    var $inp = $form.find('select[name='+name+']')
    $inp.on('change', function() {
      speaku.simple_speak(this.value, { voiceId: this.value })
    })
    _.each(voices, function(voice) {
      var opt = newEl('option')
      opt.value = voice.id
      opt.textContent = voice.label
      $inp.append(opt)
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
  
  $('form[name=edit-config]').on('submit', save_config)
  $('form[name=edit-tree]').on('submit', save_tree)
}

function validate_number(v, name) {
  var ret = parseFloat(v)
  if(isNaN(ret))
    throw new Error(name + " should be a number");
  return ret;
}

var config_validator = Object.assign({
}, _.object(_.map( // numbers
  [ 'ignore_second_hits_time', 'ignore_key_release_time', 'auto_next_loops',
    'auto_next_atfirst_delay', 'auto_next_delay',
    'auditory_voice_options.volume', 'auditory_voice_options.pitch',
    'auditory_voice_options.rateMul',
    'auditory_cue_voice_options.volume', 'auditory_cue_voice_options.pitch',
    'auditory_cue_voice_options.rateMul' ],
  function(v) { return [ v, validate_number ] })))
    

function insert_config() {
  var $form = $('form[name=edit-config]').first()
  $form.find('input,select,textarea,radio,checkbox').each(function() {
    if(this.name.length > 0 && this.name[0] != '_') {
      var path = this.name.split('.');
      var tmp = config;
      for(var i = 0, len = path.length; tmp != null && i < len; ++i) {
        var key = path[i];
        if(i + 1 == len && tmp[key]) {
          if(['radio','checkbox'].indexOf(this.type) != -1) {
            if(this.type == 'checkbox' && typeof tmp[key] == 'boolean') {
              this.checked = tmp[key];
            } else {
              this.checked = this.value == tmp[key]+'';
            }
            $(this).trigger('change');
          } else {
            this.value = tmp[key]+'';
          }
        } else {
          tmp = tmp[key]
        }
      }
    }
  });
  // specific
  if(config.auto_keys) {
    var forward_key = (config.auto_keys['13'] &&
                       config.auto_keys['13'].func == 'tree_go_in' ? 'enter' :
                       (config.auto_keys['32'] &&
                        config.auto_keys['32'].func == 'tree_go_out' ? 'space':
                        null))
    $form.find('[name=_auto_forward_key]').each(function() {
      this.checked = this.value == forward_key
    })
  }
  if(config.switch_keys) {
    var forward_key = (config.switch_keys['13'] &&
                       config.switch_keys['13'].func == 'tree_go_in'?'enter':
                       (config.switch_keys['32'] &&
                        config.switch_keys['32'].func == 'tree_go_out'?'space':
                        null))
    $form.find('[name=_switch_forward_key]').each(function() {
      this.checked = this.value == forward_key
    })
  }
  var voiceId, cue_voiceId;
  if(speaku.is_native) {
    voiceId = config.auditory_voice_options ?
      config.auditory_voice_options.voiceId : null;
    cue_voiceId = config.auditory_cue_voice_options ?
      config.auditory_cue_voice_options.voiceId : null;
  } else {
    voiceId = config.auditory_voice_options ?
      config.auditory_voice_options.alt_voiceId : null;
    cue_voiceId = config.auditory_cue_voice_options ?
      config.auditory_cue_voice_options.alt_voiceId : null;
  }
  $form.find('[name=_voice_id]').val(voiceId)
  $form.find('[name=_cue_voice_id]').val(cue_voiceId)
}

function insert_tree_data() {
  var $form = $('form[name=edit-tree]').first()
  $form.find('[name=tree-input]').val(tree_data)
}

function save_config(evt) {
  evt.preventDefault();
  var $form = $('form[name=edit-config]').first()
  var _config = JSON.parse(config_data);
  // validate & apply input
  try {
    $form.find('input,select,textarea').each(function() {
      if(this.name.length > 0 && this.name[0] != '_') {
        var path = this.name.split('.'),
            value = (this.name in config_validator ?
                     config_validator[this.name](this.value, this.name) : 
                     this.value);
        var tmp = _config;
        for(var i = 0, len = path.length; i < len; ++i) {
          var key = path[i];
          if(i + 1 == len) {
            if(this.type == 'checkbox') {
              if(!this.value || this.value.toLowerCase() == 'on') {
                // is boolean
                tmp[key] = this.checked
              } else {
                if(this.checked)
                  tmp[key] = value
                else
                  delete tmp[key]
              }
            } else if(this.type == 'radio') {
              if(this.checked) {
                tmp[key] = this.value
              }
            } else {
              tmp[key] = value;
            }
          } else {
            if(tmp[key] == null)
              tmp[key] = {}; // make an object, simple solution
            tmp = tmp[key]
          }
        }
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
    $inp = $form.find('[name=_switch_forward_key]')
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
    if(speaku.is_native) {
      _config.auditory_voice_options.voiceId = $form.find('[name=_voice_id]').val()
      _config.auditory_cue_voice_options.voiceId = $form.find('[name=_cue_voice_id]').val()
    } else {
      _config.auditory_voice_options.alt_voiceId = $form.find('[name=_voice_id]').val()
      _config.auditory_cue_voice_options.alt_voiceId = $form.find('[name=_cue_voice_id]').val()
    }
  } catch(err) {
    $form.find('.save-section .alert-danger')
      .html('<strong>Error!</strong> ' + err)
      .toggleClass('alert-hidden', false);
    return;
  }
  // then save
  // console.log(_config)
  $form.find('.save-section .alert').html('').toggleClass('alert-hidden', true)
  write_file(config_fn, JSON.stringify(_config, null, "  "))
    .then(function() {
      config = _config
      $form.find('.save-section .alert-success')
        .html('<strong>Success!</strong>')
        .toggleClass('alert-hidden', false);
    })
    .catch(function(err) {
      $form.find('.save-section .alert-danger')
        .html('<strong>Error!</strong> ' + err)
        .toggleClass('alert-hidden', false);
    })
}

function save_tree(evt) {
  evt.preventDefault();
  var $form = $('form[name=edit-tree]').first()
  // validate & apply input
  tree_data = $form.find('[name=tree-input]').val()
  // then save
  $form.find('.save-section .alert').html('').toggleClass('alert-hidden', true)
  write_file(config_fn, tree_data)
    .then(function() {
      $form.find('.save-section .alert-success')
        .html('<strong>Success!</strong>')
        .toggleClass('alert-hidden', false);
    })
    .catch(function(err) {
      $form.find('.save-section .alert-danger')
        .html('<strong>Error!</strong> ' + err)
        .toggleClass('alert-hidden', false);
    })
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
    })
  }
  var vis_edit = $el.data('toggle-visibility')
  if(vis_edit) {
    $(vis_edit).toggleClass('visibility-dependant-visible', this.checked);
  }
});

