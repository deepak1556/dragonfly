﻿"use strict";

window.cls || (window.cls = {});

cls.JSSourceTooltip = function(view)
{
  var POLL_INTERVAL = 150;
  var MAX = Math.max;
  var MIN = Math.min;
  var POW = Math.pow;
  var MIN_RADIUS = 2;
  var WHITESPACE = cls.SimpleJSParser.WHITESPACE;
  var LINETERMINATOR = cls.SimpleJSParser.LINETERMINATOR;
  var IDENTIFIER = cls.SimpleJSParser.IDENTIFIER;
  var NUMBER = cls.SimpleJSParser.NUMBER;
  var STRING = cls.SimpleJSParser.STRING;
  var PUNCTUATOR = cls.SimpleJSParser.PUNCTUATOR;
  var DIV_PUNCTUATOR = cls.SimpleJSParser.DIV_PUNCTUATOR;
  var REG_EXP = cls.SimpleJSParser.REG_EXP;
  var COMMENT = cls.SimpleJSParser.COMMENT;
  var FORWARD = 1;
  var BACKWARDS = -1;
  var TYPE = 0;
  var VALUE = 1;

  var _tooltip = null;
  var _view = null;
  var _tokenizer = null;
  var _poll_interval = 0;
  var _tooltip_target_ele = null;
  var _last_move_event = null;
  var _is_token_selected = false;
  var _mouse_positions = [];
  var _container = null;
  var _container_box = null;
  var _char_width = 0;
  var _line_height = 0;
  var _tab_size = 0;
  var _default_offset = 10;
  var _total_y_offset = 0;
  var _last_poll = {};
  var _identifier = null;
  var _identifier_boxes = [];
  var _identifier_out_count = 0;
  var _tagman = null;
  var _esde = null;
  var _is_over_tooltip = false;
  var _selection = null;
  var _last_script_text = "";

  var _poll_position = function()
  {
    if (!_last_move_event || !_selection.isCollapsed || _is_over_tooltip)
      return;

    if (_identifier)
    {
      if (_is_over_identifier_boxes(_last_move_event))
      {
        _identifier_out_count = 0;
      }
      else
      {
        if (_identifier_out_count > 1)
          _clear_selection();
        else
          _identifier_out_count += 1;
      }
    }
    
    while (_mouse_positions.length > 2)
      _mouse_positions.shift();

    _mouse_positions.push({x: _last_move_event.clientX,
                           y: _last_move_event.clientY});
    var center = _get_mouse_pos_center();
    if (center && center.r <= MIN_RADIUS)
    {
      var script = _view.get_current_script();
      if (script)
      {
        var offset_y = center.y - _container_box.top;
        var line_number = _view.get_line_number_with_offset(offset_y);
        var line = script.get_line(line_number);
        var offset_x = center.x + _container.scrollLeft - _total_y_offset;
        var char_offset = _get_char_offset(line, offset_x);
        if (char_offset > -1 &&
            !(_last_poll.script == script &&
              _last_poll.line_number == line_number && 
              _last_poll.char_offset == char_offset))
        {
          _last_poll.script = script;
          _last_poll.line_number = line_number;
          _last_poll.char_offset = char_offset;
          _last_poll.center = center;
          var line_count = Math.floor(offset_y / _line_height); 
          var box = 
          {
            top: _container_box.top + line_count * _line_height,
            bottom: _container_box.top + (line_count + 1) * _line_height,
            mouse_x: Math.floor(center.x),
            mouse_y: Math.floor(center.y)
          };
          _handle_poll_position(script, line_number, char_offset, box);
        }
      }
      else
      {
        _clear_selection();
      }
    }
  };

  var _handle_poll_position = function(script, line_number, char_offset, box)
  {
    var sel = _get_identifier(script, line_number, char_offset);
    if (sel)
    {
      var start = script.line_arr[sel.start_line - 1] + sel.start_offset;
      var end = script.line_arr[sel.end_line - 1] + sel.end_offset;
      var script_text = script.script_data.slice(start, end + 1);

      if (script_text != _last_script_text)
      {
        _last_script_text = script_text;
        var rt_id = window.runtimes.getSelectedRuntimeId();
        var thread_id = window.stop_at.getThreadId();
        var frame_index = window.stop_at.getSelectedFrameIndex();
        if (frame_index == -1)
        {
          thread_id = 0;
          frame_index = 0;
        }
        var args = [script, line_number, char_offset, box, sel, rt_id, script_text];
        var tag = _tagman.set_callback(null, _handle_script, args);
        var msg = [rt_id, thread_id, frame_index, script_text];
        _esde.requestEval(tag, msg);
      }
    }
  };

  var _handle_script = function(status, 
                                message, 
                                script,
                                line_number,
                                char_offset,
                                box,
                                selection,
                                rt_id,
                                script_text)
  {
    var STATUS = 0;
    var TYPE = 1;
    var VALUE = 2;
    var OBJECT = 3;
    var OBJECT_ID = 0;
    var CLASS_NAME = 4;

    if (!status && message[STATUS] == "completed")
    {
      _identifier = selection;
      _identifier_out_count = 0;
      _update_identifier_boxes(script, _identifier);

      if (selection.start_line != selection.end_line)
      {
        var line_count = selection.start_line - _view.getTopLine();
        if (line_count < 0)
          line_count = 0;
        
        box.top = _container_box.top + line_count * _line_height;
        var end_line = selection.end_line;
        if (end_line > _view.getBottomLine())
          end_line = _view.getBottomLine();

        line_count = selection.end_line - _view.getTopLine() + 1;
        box.bottom = _container_box.top + line_count * _line_height;
        var max_right = _get_max_right();
        box.left = _total_y_offset;
        box.right = _total_y_offset + max_right - _container.scrollLeft;        
      }

      if (message[TYPE] == "object")
      {
        var object = message[OBJECT];
        var model  = new cls.InspectableJSObject(rt_id, object[OBJECT_ID]);
        model.expand(function()
        {
          var tmpl = ["div",
                       ['h2', object[CLASS_NAME], 'class', 'js-tooltip-title'],
                       [window.templates.inspected_js_object(model, false)],
                       "class", "js-tooltip js-tooltip-examine"];
          _tooltip.show(tmpl, box);
        });
      }
      else
      {
        var value = "";
        if (message[TYPE] == "null" || message[TYPE] == "undefined")
          value = message[TYPE]
        else if (message[TYPE] == "string")
          value = "\"" + message[VALUE] + "\"";
        else
          value = message[VALUE];

        var tmpl = ["div", 
                     ["value", value, "class", message[TYPE]], 
                     "class", "js-tooltip"];
        _tooltip.show(tmpl, box);
      }

      var start_line = _identifier.start_line;
      var start_offset = _identifier.start_offset;
      var length = script_text.length;

      if (start_line < _view.getTopLine())
      {
        if (_identifier.end_line < _view.getTopLine())
          return;

        start_line = _view.getTopLine();
        start_offset = 0;
        var start = script.line_arr[start_line - 1];
        var end = script.line_arr[selection.end_line - 1] + selection.end_offset;
        length = end + 1 - start;
      }
      _view.higlight_slice(start_line, start_offset, length);
    }
  };

  var _get_tokens_of_line = function(script, line_number)
  {
    var tokens = [];
    if (script)
    {
      var line = script.get_line(line_number);
      var start_state = script.state_arr[line_number - 1];

      if (line)
      {
        _tokenizer.tokenize(line, function(token_type, token)
        {
          tokens.push([token_type, token]);
        }, false, start_state);
      }
    }
    return tokens;
  };

  var _get_identifier = function(script, line_number, char_offset)
  {
    var tokens = _get_tokens_of_line(script, line_number);

    for (var i = 0, sum = 0; i < tokens.length; i++)
    {
      sum += tokens[i][VALUE].length;
      if (sum > char_offset)
        break;
    }

    if ((tokens[i][TYPE] == IDENTIFIER &&
         !window.js_keywords.hasOwnProperty(tokens[i][VALUE])) ||
         (tokens[i][TYPE] == PUNCTUATOR &&
          (tokens[i][VALUE] == "[" || tokens[i][VALUE] == "]")))
    {
      var start = _get_identifier_chain_start(script, line_number, tokens, i);
      var end = _get_identifier_chain_end(script, line_number, tokens, i);
      return {start_line: start.start_line,
              start_offset: start.start_offset,
              end_line: end.end_line,
              end_offset: end.end_offset};
    }
    
    return null;
  };

  var _get_max_right = function()
  {
    return Math.max.apply(null, _identifier_boxes.map(function(box)
    {
      return box.right;
    }));
  };

  var _get_identifier_chain_start = function(script, line_number, tokens, match_index)
  {
    var start_line = line_number;
    var bracket_count = 0;
    var previous_token = tokens[match_index];
    var bracket_stack = [];
    var index = match_index - 1;

    if (previous_token[VALUE] == "]")
      bracket_stack.push(previous_token);

    while (true)
    {
      for (var i = match_index - 1, token = null; token = tokens[i]; i--)
      {
        switch (previous_token[TYPE])
        {
          case IDENTIFIER:
          {
            switch (token[TYPE])
            {
              case WHITESPACE:
              case LINETERMINATOR:
              case COMMENT:
              {
                continue;
              }
              case PUNCTUATOR:
              {
                if (token[VALUE] == ".")
                {
                  previous_token = token;
                  index = i - 1;
                  continue;
                }
                if (token[VALUE] == "[" && bracket_stack.length)
                {
                  bracket_stack.pop();
                  previous_token = token;
                  index = i - 1;
                  continue;
                }
              }
            }
            break;
          }
          case PUNCTUATOR:
          {
            if (previous_token[VALUE] == "." || previous_token[VALUE] == "[")
            {
              switch (token[TYPE])
              {
                case WHITESPACE:
                case LINETERMINATOR:
                case COMMENT:
                {
                  continue;
                }
                case IDENTIFIER:
                {
                  previous_token = token;
                  index = i - 1;
                  continue;
                }
                case PUNCTUATOR:
                {
                  if (token[VALUE] == "]")
                  {
                    bracket_stack.push(token[VALUE]);
                    previous_token = token;
                    index = i - 1;
                    continue;
                  }
                }
              }
            }
            else // must be "]"
            {
              switch (token[TYPE])
              {
                case WHITESPACE:
                case LINETERMINATOR:
                case COMMENT:
                {
                  continue;
                }
                case STRING:
                case NUMBER:
                case IDENTIFIER:
                {
                  previous_token = token;
                  index = i - 1;
                  continue;
                }
                case PUNCTUATOR:
                {
                  if (token[VALUE] == "]")
                  {
                    bracket_stack.push(token[VALUE]);
                    previous_token = token;
                    index = i - 1;
                    continue;
                  }
                }
              }
            }
            break;
          }
          case STRING:
          case NUMBER:
          {
            switch (token[TYPE])
            {
              case WHITESPACE:
              case LINETERMINATOR:
              case COMMENT:
              {
                continue;
              }
              case PUNCTUATOR:
              {
                if (token[VALUE] == "[")
                {
                  bracket_stack.pop();
                  previous_token = token;
                  index = i - 1;
                  continue;
                }
              }
            }
            break;
          }
        }
        break;
      }

      if (i == -1)
      {
        start_line--;
        var new_tokens = _get_tokens_of_line(script, start_line);

        if (new_tokens.length)
        {
          match_index = new_tokens.length;
          index += match_index;
          tokens = new_tokens.extend(tokens);
        }
        else
          break;
      }
      else
        break;
    } 

    while (true)
    {
      var nl_index = _get_index_of_newline(tokens);
      if (nl_index > -1 && nl_index <= index)
      {
        index -= tokens.splice(0, nl_index + 1).length;
        start_line++;
      }
      else
        break
    }

    return {start_line: start_line, start_offset: _get_sum(tokens, index)};
  };

  var _get_index_of_newline = function(tokens)
  {
    for (var i = 0, token; token = tokens[i]; i++)
    {
      if (token[TYPE] == LINETERMINATOR)
        return i;
    }
    return -1;
  };

  var _get_sum = function(tokens, index)
  {
    for (var i = 0, sum = 0; i <= index; i++)
      sum += tokens[i][VALUE].length;

    return sum;
  };

  var _get_identifier_chain_end = function(script, line_number, tokens, match_index)
  {
    var start_line = line_number;
    var bracket_count = 0;
    var previous_token = tokens[match_index];
    var bracket_stack = [];
    var index = match_index;

    if (previous_token[VALUE] == "[")
      bracket_stack.push(previous_token[TYPE]);

    while (bracket_stack.length)
    {
      for (var i = match_index + 1, token = null; token = tokens[i]; i++)
      {
        if (!bracket_stack.length)
          break;

        switch (previous_token[TYPE])
        {
          case IDENTIFIER:
          {
            switch (token[TYPE])
            {
              case WHITESPACE:
              case LINETERMINATOR:
              case COMMENT:
              {
                continue;
              }
              case PUNCTUATOR:
              {
                if (token[VALUE] == ".")
                {
                  previous_token = token;
                  index = i;
                  continue;
                }
                if (token[VALUE] == "]")
                {
                  bracket_stack.pop();
                  previous_token = token;
                  index = i;
                  continue;
                }
                if (token[VALUE] == "[")
                {
                  bracket_stack.push(token[VALUE]);
                  previous_token = token;
                  index = i;
                  continue;
                }
              }
            }
            break;
          }
          case PUNCTUATOR:
          {
            if (previous_token[VALUE] == "]")
            {
              switch (token[TYPE])
              {
                case WHITESPACE:
                case LINETERMINATOR:
                case COMMENT:
                {
                  continue;
                }
                case PUNCTUATOR:
                {
                  if (token[VALUE] == ".")
                  {
                    previous_token = token;
                    index = i - 1;
                    continue;
                  }
                  if (token[VALUE] == "]" && bracket_stack.length)
                  {
                    bracket_stack.pop();
                    previous_token = token;
                    index = i;
                    continue;
                  }
                }
              }
            }
            else if (previous_token[VALUE] == "[")
            {
              switch (token[TYPE])
              {
                case WHITESPACE:
                case LINETERMINATOR:
                case COMMENT:
                {
                  continue;
                }
                case STRING:
                case NUMBER:
                case IDENTIFIER:
                {
                  previous_token = token;
                  index = i;
                  continue;
                }
              }
            }
            else // must be "."
            {
              switch (token[TYPE])
              {
                case WHITESPACE:
                case LINETERMINATOR:
                case COMMENT:
                {
                  continue;
                }
                case IDENTIFIER:
                {
                  previous_token = token;
                  index = i;
                  continue;
                }
              }
            }
            break;
          }
          case STRING:
          case NUMBER:
          {
            switch (token[TYPE])
            {
              case WHITESPACE:
              case LINETERMINATOR:
              case COMMENT:
              {
                continue;
              }
              case PUNCTUATOR:
              {
                if (token[VALUE] == "]")
                {
                  bracket_stack.pop();
                  previous_token = token;
                  index = i;
                  continue;
                }
              }
            }
            break;
          }
        }


      }

      if (i == tokens.length && bracket_stack.length)
      {
        start_line++;
        var new_tokens = _get_tokens_of_line(script, start_line);

        if (new_tokens.length)
        {
          match_index = i;
          tokens.extend(new_tokens);
        }
        else
          break;
      }
      else
        break;
    } 

    while (true)
    {
      var nl_index = _get_index_of_newline(tokens);
      if (nl_index > -1 && nl_index <= index)
        index -= tokens.splice(0, nl_index + 1).length;
      else
        break
    }

    return {end_line: start_line, end_offset: _get_sum(tokens, index) - 1};
  };

  var _get_mouse_pos_center = function()
  {
    var center = null;
    if (_mouse_positions.length > 2)
    {
      var min_x = MIN(_mouse_positions[0].x,
                      _mouse_positions[1].x,
                      _mouse_positions[2].x);
      var max_x = MAX(_mouse_positions[0].x,
                      _mouse_positions[1].x,
                      _mouse_positions[2].x);
      var min_y = MIN(_mouse_positions[0].y,
                      _mouse_positions[1].y,
                      _mouse_positions[2].y);
      var max_y = MAX(_mouse_positions[0].y,
                      _mouse_positions[1].y,
                      _mouse_positions[2].y);
      var dx = max_x - min_x;
      var dy = max_y - min_y;

      center = {x: min_x + dx / 2,
                y: min_y + dy / 2,
                r: POW(POW(dx / 2, 2) + POW(dy / 2, 2), 0.5)};
    }
    return center;
  };

  var _update_identifier_boxes = function(script, identifier)
  {
    // translates the current selected identifier to dimesion boxes
    // position and dimensions are absolute to the source text
    var line_number = _identifier.start_line;
    
    var start_offset = _identifier.start_offset;
    var end_offset = 0;
    _identifier_boxes = [];
    while (true)
    {
      var box = {};
      var line = script.get_line(line_number);
      box.left = _get_pixel_offset(line, start_offset);
      if (line_number < _identifier.end_line)
        box.right = _get_pixel_offset(line, line.length + 1);
      else
        box.right = _get_pixel_offset(line, _identifier.end_offset + 1);
      box.top = (line_number - 1) * _line_height;
      box.bottom = line_number * _line_height;
      _identifier_boxes.push(box);
      if (line_number == _identifier.end_line ||
          line_number >= script.line_arr.length)
        break;
      else
        line_number += 1;
      start_offset = 0;
    }
  };

  var _is_over_identifier_boxes = function(event)
  {
    var off_x = _total_y_offset - _container.scrollLeft;
    var off_y = _container_box.top - (_view.getTopLine() - 1) * _line_height;
    var e_x = event.clientX - off_x;
    var e_y = event.clientY - off_y;

    for (var i = 0, box; box = _identifier_boxes[i]; i++)
    {
      if (e_x >= box.left && e_x <= box.right &&
          e_y >= box.top && e_y <= box.bottom)
        return true;
    }
    return false;
  };

  var _clear_selection = function()
  {
    _identifier = null;
    _last_script_text = "";
    _last_poll = {};
    _view.higlight_slice();
    _tooltip.hide();
  };

  var _get_char_offset = function(line, offset)
  {
    offset /= _char_width;
    for (var i = 0, l = line.length, offset_count = 0; i < l; i++)
    {
      offset_count += line[i] == "\t"
                     ? _tab_size - (offset_count % _tab_size)
                     : 1;
      if (offset_count > offset)
        return i;
    }
    return -1;
  };

  var _get_pixel_offset = function(line, char_offset)
  {
    for (var i = 0, offset_count = 0, char = ""; i < char_offset; i++)
    {
      char = line[i];
      if (char == "\n" || char == "\r")
        continue;

      offset_count += char == "\t"
                     ? _tab_size - offset_count % _tab_size
                     : 1;
    }
    return offset_count * _char_width;
  };

  var _get_tab_size = function()
  {
    var style_dec = document.styleSheets.getDeclaration("#js-source-content div");
    return style_dec ? parseInt(style_dec.getPropertyValue("-o-tab-size")) : 0;
  };

  var _get_container_box = function()
  {
    if (_container)
      _container_box = _container.getBoundingClientRect();
  };

  /* event handlers */

  var _onmousemove = function(event)
  {
    _last_move_event = event;
  };

  var _ontooltip = function(event, target)
  {
    if (!_poll_interval)
    {
      if (!_char_width)
        _onmonospacefontchange();

      var container = _view.get_scroll_container();
      if (container && target.parentNode)
      {
        _container = container;
        _container_box = container.getBoundingClientRect();
        _tooltip_target_ele = target.parentNode;
        _tooltip_target_ele.addEventListener('mousemove', _onmousemove, false);
        while (_mouse_positions.length)
          _mouse_positions.pop();

        _total_y_offset = _container_box.left + _default_offset;
        _selection = window.getSelection();
        _poll_interval = setInterval(_poll_position, POLL_INTERVAL);
      }
    }    
  };

  var _onhide = function()
  {
    if (_poll_interval)
    {
      clearInterval(_poll_interval);
      _clear_selection();
      _tooltip_target_ele.removeEventListener('mousemove', _onmousemove, false);
      _poll_interval = 0;
      _tooltip_target_ele = null;
      _container_box = null;
      _container = null;
      _selection = null;
    }
  };

  var _ontooltipenter = function(event)
  {
    _is_over_tooltip = true;
  };

  var _ontooltipleave = function(event)
  {
    _is_over_tooltip = false;
  };

  var _onmonospacefontchange = function(msg)
  {
    _char_width = defaults["js-source-char-width"];
    _line_height = defaults["js-source-line-height"];
    _tab_size = _get_tab_size();
    _default_offset = defaults["js-default-text-offset"];
  };

  var _init = function(view)
  {
    _view = view;
    _tokenizer = new cls.SimpleJSParser();
    _tooltip = Tooltips.register(cls.JSSourceTooltip.tooltip_name, true);
    _tooltip.ontooltip = _ontooltip;
    _tooltip.onhide = _onhide;
    _tooltip.ontooltipenter = _ontooltipenter;
    _tooltip.ontooltipleave = _ontooltipleave;
    _tagman = window.tagManager;
    _esde = window.services['ecmascript-debugger'];
    window.messages.addListener('monospace-font-changed', _onmonospacefontchange);
    window.addEventListener('resize', _get_container_box, false);
  };

  this.unregister = function()
  {
    Tooltips.unregister(cls.JSSourceTooltip.tooltip_name, _tooltip);
    window.messages.removeListener('monospace-font-changed', _onmonospacefontchange);
    window.removeEventListener('resize', _get_container_box, false);
  };

  _init(view);
};

cls.JSSourceTooltip.tooltip_name = "js-source";
