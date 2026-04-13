#include <pebble.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "message_keys.auto.h"
#include "core/payload_parser.h"
#include "core/sync_status.h"
#include "core/unread_badge.h"

#define TG_MAX_CHATS 20
#define TG_MAX_MESSAGES 40
#define TG_HEADER_HEIGHT 24
#define TG_FOOTER_HEIGHT 18
#define TG_PREVIEW_SCROLL_HEIGHT 88

#define TG_MSG_APP_READY "app_ready"
#define TG_MSG_OPEN_CHAT "open_chat"
#define TG_MSG_CHAT_ITEM "chat_item"
#define TG_MSG_CHAT_LIST_COMPLETE "chat_list_complete"
#define TG_MSG_MESSAGE_ITEM "message_item"
#define TG_MSG_CHAT_PAGE_COMPLETE "chat_page_complete"
#define TG_MSG_SYNC_STATUS "sync_status"
#define TG_MSG_SETTINGS_STATE "settings_state"
#define TG_MSG_TOGGLE_SEND_MODE "toggle_send_mode"
#define TG_MSG_TOGGLE_CHAT_PREVIEW "toggle_chat_preview"
#define TG_MSG_CLEAR_CACHE "clear_cache"
#define TG_MSG_LOGOUT "logout"
#define TG_MSG_SEND_MESSAGE "send_message"
#define TG_MSG_SEND_RESULT "send_result"

typedef struct {
  int32_t id;
  unsigned int unread_count;
  char title[TG_CHAT_TITLE_LENGTH];
  char preview[TG_CHAT_PREVIEW_LENGTH];
} TgChatItem;

typedef struct {
  bool show_sender;
  bool outgoing;
  char sender[TG_MESSAGE_SENDER_LENGTH];
  char text[TG_MESSAGE_TEXT_LENGTH];
} TgMessageItem;

static Window *s_chat_list_window;
static Window *s_chat_window;
static Window *s_preview_window;
static Window *s_settings_window;

static MenuLayer *s_chat_list_menu_layer;
static MenuLayer *s_chat_menu_layer;
static MenuLayer *s_settings_menu_layer;
static ScrollLayer *s_preview_scroll_layer;

static TextLayer *s_chat_list_sync_layer;
static TextLayer *s_chat_list_settings_layer;

static TextLayer *s_chat_back_layer;
static TextLayer *s_chat_title_layer;
static TextLayer *s_chat_mic_layer;
static TextLayer *s_chat_sync_layer;

static TextLayer *s_preview_title_layer;
static TextLayer *s_preview_sync_layer;
static TextLayer *s_preview_text_layer;

static TextLayer *s_settings_title_layer;
static TextLayer *s_settings_sync_layer;

static AppTimer *s_bootstrap_timer;

#if defined(PBL_MICROPHONE)
static DictationSession *s_dictation_session;
#endif

static TgChatItem s_chats[TG_MAX_CHATS];
static TgMessageItem s_messages[TG_MAX_MESSAGES];
static size_t s_chat_count = 0;
static size_t s_message_count = 0;

static int32_t s_active_chat_id = -1;
static char s_active_chat_title[TG_CHAT_TITLE_LENGTH] = "Chat";
static char s_preview_text[TG_MESSAGE_TEXT_LENGTH] = "";
static char s_preview_status[TG_STATUS_TEXT_LENGTH] = "Tap Select to send";
static char s_preview_display_text[TG_STATUS_TEXT_LENGTH + TG_MESSAGE_TEXT_LENGTH + 8] = "";
static bool s_preview_send_error = false;
static bool s_waiting_for_send_result = false;
static bool s_send_mode_auto = false;
static bool s_preview_chat_message = false;
static bool s_has_received_inbox = false;
static bool s_has_session = false;
static bool s_has_auth_error = false;
static TgSyncStatus s_sync_status = TG_SYNC_STATUS_SYNCING;
static AppTimer *s_sync_status_timer = NULL;
static size_t s_sync_status_frame = 0;

static void prv_update_sync_layers(void);
static void prv_update_preview_contents(void);
static void prv_request_chat_list(void);
static void prv_request_chat_page(int32_t chat_id);
static void prv_schedule_bootstrap(uint32_t delay_ms);
static void prv_copy_string(char *dest, size_t dest_size, const char *src);

static void prv_chat_list_zero_state(char *title, size_t title_size, char *subtitle, size_t subtitle_size) {
  if (!s_has_received_inbox || s_sync_status == TG_SYNC_STATUS_SYNCING) {
    prv_copy_string(title, title_size, "Loading chats");
    prv_copy_string(subtitle, subtitle_size, "Waiting for phone sync");
    return;
  }

  if (!s_has_session && s_has_auth_error) {
    prv_copy_string(title, title_size, "Sign-in failed");
    prv_copy_string(subtitle, subtitle_size, "Retry in phone config");
    return;
  }

  if (!s_has_session) {
    prv_copy_string(title, title_size, "Sign in required");
    prv_copy_string(subtitle, subtitle_size, "Open phone config");
    return;
  }

  if (s_sync_status == TG_SYNC_STATUS_DESYNCED) {
    prv_copy_string(title, title_size, "Sync issue");
    prv_copy_string(subtitle, subtitle_size, "Check phone connection");
    return;
  }

  prv_copy_string(title, title_size, "No chats yet");
  prv_copy_string(subtitle, subtitle_size, "Nothing to show");
}

static bool prv_parse_count_string(const char *value, size_t max_value, size_t *out) {
  size_t parsed = 0;
  size_t index = 0;

  if (!value || !value[0] || !out) {
    return false;
  }

  while (value[index] != '\0') {
    if (value[index] < '0' || value[index] > '9') {
      return false;
    }

    parsed = (parsed * 10U) + (size_t)(value[index] - '0');
    if (parsed > max_value) {
      parsed = max_value;
      break;
    }
    index += 1;
  }

  *out = parsed;
  return true;
}

static bool prv_supports_microphone(void) {
#if defined(PBL_MICROPHONE)
  return true;
#else
  return false;
#endif
}

static void prv_copy_string(char *dest, size_t dest_size, const char *src) {
  if (!dest || dest_size == 0) {
    return;
  }

  (void)snprintf(dest, dest_size, "%s", src ? src : "");
}

static const char *prv_sync_glyph(void) {
  static const char *spinner_frames[] = {"|", "/", "-", "\\"};

  switch (s_sync_status) {
    case TG_SYNC_STATUS_SYNCING:
      return spinner_frames[s_sync_status_frame % ARRAY_LENGTH(spinner_frames)];
    case TG_SYNC_STATUS_SYNCED:
      return "+";
    case TG_SYNC_STATUS_DESYNCED:
    default:
      return "!";
  }
}

static void prv_sync_status_timer_callback(void *context) {
  (void)context;
  s_sync_status_timer = NULL;

  if (s_sync_status != TG_SYNC_STATUS_SYNCING) {
    return;
  }

  s_sync_status_frame += 1;
  prv_update_sync_layers();
  s_sync_status_timer = app_timer_register(220, prv_sync_status_timer_callback, NULL);
}

static void prv_sync_status_animation_start(void) {
  if (s_sync_status != TG_SYNC_STATUS_SYNCING || s_sync_status_timer) {
    return;
  }

  s_sync_status_timer = app_timer_register(220, prv_sync_status_timer_callback, NULL);
}

static void prv_sync_status_animation_stop(void) {
  if (!s_sync_status_timer) {
    return;
  }

  app_timer_cancel(s_sync_status_timer);
  s_sync_status_timer = NULL;
}

static void prv_update_sync_layers(void) {
  const char *glyph = prv_sync_glyph();

  if (s_chat_list_sync_layer) {
    text_layer_set_text(s_chat_list_sync_layer, glyph);
  }
  if (s_chat_sync_layer) {
    text_layer_set_text(s_chat_sync_layer, glyph);
  }
  if (s_preview_sync_layer) {
    text_layer_set_text(s_preview_sync_layer, glyph);
  }
  if (s_settings_sync_layer) {
    text_layer_set_text(s_settings_sync_layer, glyph);
  }
}

static void prv_set_sync_status_from_string(const char *value) {
  if (!value) {
    return;
  }

  if (strcmp(value, "syncing") == 0) {
    s_sync_status = TG_SYNC_STATUS_SYNCING;
    prv_sync_status_animation_start();
  } else if (strcmp(value, "synced") == 0) {
    s_sync_status = TG_SYNC_STATUS_SYNCED;
    prv_sync_status_animation_stop();
  } else {
    s_sync_status = TG_SYNC_STATUS_DESYNCED;
    prv_sync_status_animation_stop();
  }

  s_sync_status_frame = 0;
  prv_update_sync_layers();
}

static TextLayer *prv_create_label_layer(Layer *root_layer, GRect frame, const char *text, const char *font_key,
                                         GTextAlignment alignment) {
  TextLayer *layer = text_layer_create(frame);
  text_layer_set_text(layer, text);
  text_layer_set_font(layer, fonts_get_system_font(font_key));
  text_layer_set_background_color(layer, GColorClear);
  text_layer_set_text_alignment(layer, alignment);
  layer_add_child(root_layer, text_layer_get_layer(layer));
  return layer;
}

static TextLayer *prv_create_title_layer(Layer *root_layer, GRect frame, const char *title) {
  return prv_create_label_layer(root_layer, frame, title, FONT_KEY_GOTHIC_18_BOLD, GTextAlignmentLeft);
}

static TextLayer *prv_create_sync_layer(Layer *root_layer, GRect frame) {
  return prv_create_label_layer(root_layer, frame, prv_sync_glyph(), FONT_KEY_GOTHIC_18_BOLD, GTextAlignmentRight);
}

static void prv_set_preview_status(const char *text, bool is_error) {
  if (!text) {
    s_preview_status[0] = '\0';
  } else if (text != s_preview_status) {
    prv_copy_string(s_preview_status, sizeof(s_preview_status), text);
  }
  s_preview_send_error = is_error;
  prv_update_preview_contents();
}

static void prv_update_preview_contents(void) {
  GRect bounds;
  GSize text_size;

  if (!s_preview_text_layer || !s_preview_scroll_layer) {
    return;
  }

  if (s_preview_status[0] != '\0' && s_preview_text[0] != '\0') {
    (void)snprintf(s_preview_display_text, sizeof(s_preview_display_text), "%s\n\n%s", s_preview_status,
                   s_preview_text);
  } else if (s_preview_status[0] != '\0') {
    (void)snprintf(s_preview_display_text, sizeof(s_preview_display_text), "%s", s_preview_status);
  } else {
    (void)snprintf(s_preview_display_text, sizeof(s_preview_display_text), "%s", s_preview_text);
  }

  text_layer_set_text(s_preview_text_layer, s_preview_display_text);
  bounds = layer_get_bounds(scroll_layer_get_layer(s_preview_scroll_layer));
  text_size = text_layer_get_content_size(s_preview_text_layer);
  if (text_size.h < TG_PREVIEW_SCROLL_HEIGHT) {
    text_size.h = TG_PREVIEW_SCROLL_HEIGHT;
  }
  text_layer_set_size(s_preview_text_layer, GSize(bounds.size.w - 16, text_size.h));
  scroll_layer_set_content_size(s_preview_scroll_layer, GSize(bounds.size.w, text_size.h));
}

static bool prv_send_request(const char *type, const char *payload) {
  DictionaryIterator *iter = NULL;

  if (app_message_outbox_begin(&iter) != APP_MSG_OK || !iter) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Failed to begin outbox for %s", type);
    return false;
  }

  dict_write_cstring(iter, MESSAGE_KEY_MessageType, type);
  if (payload && payload[0] != '\0') {
    dict_write_cstring(iter, MESSAGE_KEY_PayloadJson, payload);
  }

  if (app_message_outbox_send() != APP_MSG_OK) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Failed to send message type %s", type);
    return false;
  }

  return true;
}

static void prv_bootstrap_timer_callback(void *context) {
  (void)context;
  s_bootstrap_timer = NULL;
  if (s_has_received_inbox) {
    return;
  }
  prv_request_chat_list();
  if (!s_has_received_inbox) {
    prv_schedule_bootstrap(1500);
  }
}

static void prv_schedule_bootstrap(uint32_t delay_ms) {
  if (s_bootstrap_timer) {
    app_timer_cancel(s_bootstrap_timer);
    s_bootstrap_timer = NULL;
  }

  s_bootstrap_timer = app_timer_register(delay_ms, prv_bootstrap_timer_callback, NULL);
}

static void prv_clear_chat_items(void) {
  memset(s_chats, 0, sizeof(s_chats));
  s_chat_count = 0;
  if (s_chat_list_menu_layer) {
    menu_layer_reload_data(s_chat_list_menu_layer);
  }
}

static void prv_clear_message_items(void) {
  memset(s_messages, 0, sizeof(s_messages));
  s_message_count = 0;
  if (s_chat_menu_layer) {
    menu_layer_reload_data(s_chat_menu_layer);
  }
}

static void prv_request_chat_list(void) {
  prv_clear_chat_items();
  prv_set_sync_status_from_string("syncing");
  (void)prv_send_request(TG_MSG_APP_READY, "");
}

static void prv_request_chat_page(int32_t chat_id) {
  char payload[16];
  prv_clear_message_items();
  prv_set_sync_status_from_string("syncing");
  (void)snprintf(payload, sizeof(payload), "%ld", (long)chat_id);
  (void)prv_send_request(TG_MSG_OPEN_CHAT, payload);
}

static void prv_append_outgoing_message(const char *text) {
  TgMessageItem *message = NULL;
  size_t index = s_message_count;

  if (index >= TG_MAX_MESSAGES) {
    return;
  }

  message = &s_messages[index];
  message->show_sender = index == 0 || !s_messages[index - 1].outgoing;
  message->outgoing = true;
  prv_copy_string(message->sender, sizeof(message->sender), "You");
  prv_copy_string(message->text, sizeof(message->text), text);
  s_message_count += 1;

  for (size_t chat_index = 0; chat_index < s_chat_count; chat_index += 1) {
    if (s_chats[chat_index].id == s_active_chat_id) {
      prv_copy_string(s_chats[chat_index].preview, sizeof(s_chats[chat_index].preview), text);
      s_chats[chat_index].unread_count = 0;
      break;
    }
  }

  if (s_chat_menu_layer) {
    menu_layer_reload_data(s_chat_menu_layer);
    menu_layer_set_selected_index(s_chat_menu_layer, MenuIndex(0, (int)(s_message_count - 1)), MenuRowAlignBottom,
                                  false);
  }
  if (s_chat_list_menu_layer) {
    menu_layer_reload_data(s_chat_list_menu_layer);
  }
}

static void prv_send_preview_message(void) {
  char payload[128];

  if (s_waiting_for_send_result || s_preview_text[0] == '\0' || s_active_chat_id < 0) {
    return;
  }

  (void)snprintf(payload, sizeof(payload), "%ld|%s", (long)s_active_chat_id, s_preview_text);
  s_waiting_for_send_result = true;
  prv_set_preview_status("Sending...", false);
  (void)prv_send_request(TG_MSG_SEND_MESSAGE, payload);
}

static void prv_show_preview_window(void) {
  prv_update_preview_contents();
  prv_set_preview_status(s_preview_status, s_preview_send_error);

  if (s_preview_window && !window_stack_contains_window(s_preview_window)) {
    window_stack_push(s_preview_window, true);
  }
}

static void prv_push_chat_window_for_selected_row(uint16_t row) {
  if (row >= s_chat_count) {
    return;
  }

  s_active_chat_id = s_chats[row].id;
  prv_copy_string(s_active_chat_title, sizeof(s_active_chat_title), s_chats[row].title);
  if (s_chat_title_layer) {
    text_layer_set_text(s_chat_title_layer, s_active_chat_title);
  }

  window_stack_push(s_chat_window, true);
  prv_request_chat_page(s_active_chat_id);
}

static uint16_t prv_chat_list_get_num_sections(struct MenuLayer *menu_layer, void *context) {
  (void)menu_layer;
  (void)context;
  return 2;
}

static uint16_t prv_chat_list_get_num_rows(struct MenuLayer *menu_layer, uint16_t section_index, void *context) {
  (void)menu_layer;
  (void)context;

  if (section_index == 0) {
    return s_chat_count == 0 ? 1 : (uint16_t)s_chat_count;
  }

  return 1;
}

static int16_t prv_chat_list_get_header_height(struct MenuLayer *menu_layer, uint16_t section_index, void *context) {
  (void)menu_layer;
  (void)section_index;
  (void)context;
  return MENU_CELL_BASIC_HEADER_HEIGHT;
}

static void prv_chat_list_draw_header(GContext *ctx, const Layer *cell_layer, uint16_t section_index, void *context) {
  (void)context;
  menu_cell_basic_header_draw(ctx, cell_layer, section_index == 0 ? "Chats" : "Menu");
}

static int16_t prv_chat_list_get_cell_height(struct MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  (void)menu_layer;
  (void)context;

  if (cell_index->section == 1) {
    return 28;
  }

  if (s_chat_count == 0) {
    return 40;
  }

  return s_preview_chat_message && cell_index->row < (int)s_chat_count ? 44 : 28;
}

static void prv_chat_list_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  GRect bounds = layer_get_bounds(cell_layer);
  bool highlighted = menu_cell_layer_is_highlighted(cell_layer);
  GColor text_color = highlighted ? GColorWhite : GColorBlack;
  char unread_text[8];
  char title_text[TG_CHAT_TITLE_LENGTH];
  char subtitle_text[TG_STATUS_TEXT_LENGTH];

  (void)context;

  if (cell_index->section == 1) {
    menu_cell_basic_draw(ctx, cell_layer, "Settings", "Send mode, cache, logout", NULL);
    return;
  }

  if (s_chat_count == 0) {
    prv_chat_list_zero_state(title_text, sizeof(title_text), subtitle_text, sizeof(subtitle_text));
    menu_cell_basic_draw(ctx, cell_layer, title_text, subtitle_text, NULL);
    return;
  }

#if defined(PBL_COLOR)
  graphics_context_set_text_color(ctx, text_color);
#else
  graphics_context_set_text_color(ctx, text_color);
#endif

  graphics_draw_text(ctx, s_chats[cell_index->row].title, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD),
                     GRect(8, 2, bounds.size.w - 44, 18), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft,
                     NULL);
  if (s_preview_chat_message) {
    graphics_draw_text(ctx, s_chats[cell_index->row].preview, fonts_get_system_font(FONT_KEY_GOTHIC_14),
                       GRect(8, 20, bounds.size.w - 16, 18), GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft,
                       NULL);
  }

  tg_format_unread_badge(s_chats[cell_index->row].unread_count, unread_text, sizeof(unread_text));
  if (unread_text[0] != '\0') {
    graphics_draw_text(ctx, unread_text, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD),
                       GRect(bounds.size.w - 34, 4, 26, 14), GTextOverflowModeTrailingEllipsis,
                       GTextAlignmentRight, NULL);
  }
}

static void prv_chat_list_select_click(struct MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  (void)menu_layer;
  (void)context;

  if (cell_index->section == 1) {
    window_stack_push(s_settings_window, true);
    return;
  }

  if (s_chat_count == 0) {
    return;
  }

  prv_push_chat_window_for_selected_row((uint16_t)cell_index->row);
}

static uint16_t prv_chat_get_num_rows(struct MenuLayer *menu_layer, uint16_t section_index, void *context) {
  (void)menu_layer;
  (void)section_index;
  (void)context;
  return s_message_count == 0 ? 1 : (uint16_t)s_message_count;
}

static int16_t prv_chat_get_cell_height(struct MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  GRect bounds = layer_get_bounds(menu_layer_get_layer(menu_layer));
  GTextAlignment alignment = GTextAlignmentLeft;
  GSize text_size;
  int16_t height = 8;

  (void)context;

  if (s_message_count == 0) {
    return 40;
  }

  alignment = s_messages[cell_index->row].outgoing ? GTextAlignmentRight : GTextAlignmentLeft;
  text_size = graphics_text_layout_get_content_size(
      s_messages[cell_index->row].text, fonts_get_system_font(FONT_KEY_GOTHIC_18),
      GRect(0, 0, bounds.size.w - 16, 2000), GTextOverflowModeWordWrap, alignment);

  if (s_messages[cell_index->row].show_sender) {
    height += 14;
  }

  height += text_size.h + 8;
  return height < 30 ? 30 : height;
}

static void prv_chat_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  GRect bounds = layer_get_bounds(cell_layer);
  GTextAlignment alignment = GTextAlignmentLeft;
  bool highlighted = menu_cell_layer_is_highlighted(cell_layer);
  GColor text_color = GColorBlack;
  int16_t y = 4;

  (void)context;

  if (s_message_count == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "Loading chat", "Waiting for recent messages", NULL);
    return;
  }

  alignment = s_messages[cell_index->row].outgoing ? GTextAlignmentRight : GTextAlignmentLeft;
  if (highlighted) {
    text_color = GColorWhite;
  }
#if defined(PBL_COLOR)
  else if (s_messages[cell_index->row].outgoing) {
    text_color = GColorPictonBlue;
  }
#endif
  graphics_context_set_text_color(ctx, text_color);

  if (s_messages[cell_index->row].show_sender) {
    graphics_draw_text(ctx, s_messages[cell_index->row].sender, fonts_get_system_font(FONT_KEY_GOTHIC_14_BOLD),
                       GRect(8, y, bounds.size.w - 16, 12), GTextOverflowModeTrailingEllipsis, alignment, NULL);
    y += 14;
  }

  graphics_draw_text(ctx, s_messages[cell_index->row].text, fonts_get_system_font(FONT_KEY_GOTHIC_18),
                     GRect(8, y, bounds.size.w - 16, bounds.size.h - y - 2), GTextOverflowModeWordWrap, alignment,
                     NULL);
}

static uint16_t prv_settings_get_num_rows(struct MenuLayer *menu_layer, uint16_t section_index, void *context) {
  (void)menu_layer;
  (void)section_index;
  (void)context;
  return 4;
}

static void prv_settings_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *cell_index, void *context) {
  (void)ctx;
  (void)context;

  switch (cell_index->row) {
    case 0:
      menu_cell_basic_draw(ctx, cell_layer, "Send mode", s_send_mode_auto ? "Auto-send" : "Preview", NULL);
      break;
    case 1:
      menu_cell_basic_draw(ctx, cell_layer, "Chat preview", s_preview_chat_message ? "On" : "Off", NULL);
      break;
    case 2:
      menu_cell_basic_draw(ctx, cell_layer, "Clear cache", "Reset chats and messages", NULL);
      break;
    case 3:
    default:
      menu_cell_basic_draw(ctx, cell_layer, "Logout", "Clear session and cache", NULL);
      break;
  }
}

static void prv_settings_select_click(struct MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  (void)menu_layer;
  (void)context;

  switch (cell_index->row) {
    case 0:
      s_send_mode_auto = !s_send_mode_auto;
      (void)prv_send_request(TG_MSG_TOGGLE_SEND_MODE, s_send_mode_auto ? "auto" : "preview");
      menu_layer_reload_data(s_settings_menu_layer);
      break;
    case 1:
      s_preview_chat_message = !s_preview_chat_message;
      if (s_chat_list_menu_layer) {
        menu_layer_reload_data(s_chat_list_menu_layer);
      }
      (void)prv_send_request(TG_MSG_TOGGLE_CHAT_PREVIEW, s_preview_chat_message ? "1" : "0");
      menu_layer_reload_data(s_settings_menu_layer);
      break;
    case 2:
      prv_clear_chat_items();
      prv_clear_message_items();
      (void)prv_send_request(TG_MSG_CLEAR_CACHE, "");
      break;
    case 3:
    default:
      prv_clear_chat_items();
      prv_clear_message_items();
      s_active_chat_id = -1;
      prv_copy_string(s_active_chat_title, sizeof(s_active_chat_title), "Chat");
      if (window_stack_contains_window(s_preview_window)) {
        window_stack_remove(s_preview_window, false);
      }
      if (window_stack_contains_window(s_settings_window)) {
        window_stack_remove(s_settings_window, false);
      }
      if (window_stack_contains_window(s_chat_window)) {
        window_stack_remove(s_chat_window, false);
      }
      (void)prv_send_request(TG_MSG_LOGOUT, "");
      break;
  }
}

static void prv_preview_select_handler(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer;
  (void)context;
  prv_send_preview_message();
}

static void prv_preview_click_config_provider(void *context) {
  (void)context;
  window_single_click_subscribe(BUTTON_ID_SELECT, prv_preview_select_handler);
}

#if defined(PBL_MICROPHONE)
static void prv_show_dictation_failure(void) {
  prv_copy_string(s_preview_text, sizeof(s_preview_text), "");
  s_waiting_for_send_result = false;
  prv_set_preview_status("Voice input unavailable", true);
  prv_show_preview_window();
}

static void prv_dictation_callback(DictationSession *session, DictationSessionStatus status, char *transcription,
                                   void *context) {
  (void)session;
  (void)context;

  if (status != DictationSessionStatusSuccess || !transcription) {
    prv_show_dictation_failure();
    return;
  }

  prv_copy_string(s_preview_text, sizeof(s_preview_text), transcription);
  s_preview_send_error = false;
  s_waiting_for_send_result = false;
  prv_set_preview_status(s_send_mode_auto ? "Sending..." : "Tap Select to send", false);
  prv_show_preview_window();

  if (s_send_mode_auto) {
    prv_send_preview_message();
  }
}

static void prv_chat_select_click(struct MenuLayer *menu_layer, MenuIndex *cell_index, void *context) {
  (void)menu_layer;
  (void)cell_index;
  (void)context;

  if (s_active_chat_id < 0 || !s_dictation_session) {
    return;
  }

  dictation_session_start(s_dictation_session);
}
#endif

static void prv_chat_list_window_load(Window *window) {
  Layer *root_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root_layer);
  GRect menu_frame = GRect(0, 0, bounds.size.w, bounds.size.h - TG_FOOTER_HEIGHT);

  s_chat_list_sync_layer =
      prv_create_sync_layer(root_layer, GRect(4, bounds.size.h - TG_FOOTER_HEIGHT - 1, 14, TG_FOOTER_HEIGHT));
  s_chat_list_settings_layer = prv_create_label_layer(
      root_layer, GRect(20, bounds.size.h - TG_FOOTER_HEIGHT, bounds.size.w - 24, TG_FOOTER_HEIGHT),
      "Settings at end", FONT_KEY_GOTHIC_14, GTextAlignmentRight);

  s_chat_list_menu_layer = menu_layer_create(menu_frame);
  menu_layer_set_callbacks(s_chat_list_menu_layer, NULL,
                           (MenuLayerCallbacks){
                               .get_num_sections = prv_chat_list_get_num_sections,
                               .get_num_rows = prv_chat_list_get_num_rows,
                               .get_header_height = prv_chat_list_get_header_height,
                               .draw_header = prv_chat_list_draw_header,
                               .get_cell_height = prv_chat_list_get_cell_height,
                               .draw_row = prv_chat_list_draw_row,
                               .select_click = prv_chat_list_select_click,
                           });
  layer_add_child(root_layer, menu_layer_get_layer(s_chat_list_menu_layer));
  menu_layer_set_click_config_onto_window(s_chat_list_menu_layer, window);
}

static void prv_chat_list_window_unload(Window *window) {
  (void)window;
  menu_layer_destroy(s_chat_list_menu_layer);
  text_layer_destroy(s_chat_list_sync_layer);
  text_layer_destroy(s_chat_list_settings_layer);
  s_chat_list_menu_layer = NULL;
  s_chat_list_sync_layer = NULL;
  s_chat_list_settings_layer = NULL;
}

static void prv_chat_window_load(Window *window) {
  Layer *root_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root_layer);
  GRect menu_frame = GRect(0, TG_HEADER_HEIGHT, bounds.size.w, bounds.size.h - TG_HEADER_HEIGHT);
  int16_t mic_width = prv_supports_microphone() ? 18 : 0;
  int16_t title_width = bounds.size.w - 18 - mic_width - 18 - 10;

  s_chat_back_layer =
      prv_create_label_layer(root_layer, GRect(4, 1, 14, TG_HEADER_HEIGHT), "<", FONT_KEY_GOTHIC_18_BOLD,
                             GTextAlignmentLeft);
  s_chat_title_layer = prv_create_title_layer(root_layer, GRect(18, 0, title_width, TG_HEADER_HEIGHT),
                                              s_active_chat_title);
  if (prv_supports_microphone()) {
    s_chat_mic_layer =
        prv_create_label_layer(root_layer, GRect(bounds.size.w - 34, 1, 16, TG_HEADER_HEIGHT), "M",
                               FONT_KEY_GOTHIC_18_BOLD, GTextAlignmentRight);
  } else {
    s_chat_mic_layer = NULL;
  }
  s_chat_sync_layer = prv_create_sync_layer(root_layer, GRect(bounds.size.w - 18, 0, 14, TG_HEADER_HEIGHT));

  s_chat_menu_layer = menu_layer_create(menu_frame);
  menu_layer_set_callbacks(s_chat_menu_layer, NULL,
                           (MenuLayerCallbacks){
                               .get_num_rows = prv_chat_get_num_rows,
                               .get_cell_height = prv_chat_get_cell_height,
                               .draw_row = prv_chat_draw_row,
#if defined(PBL_MICROPHONE)
                               .select_click = prv_chat_select_click,
#endif
                           });
  layer_add_child(root_layer, menu_layer_get_layer(s_chat_menu_layer));
  menu_layer_set_click_config_onto_window(s_chat_menu_layer, window);
}

static void prv_chat_window_unload(Window *window) {
  (void)window;
  menu_layer_destroy(s_chat_menu_layer);
  text_layer_destroy(s_chat_back_layer);
  text_layer_destroy(s_chat_title_layer);
  text_layer_destroy(s_chat_sync_layer);
  if (s_chat_mic_layer) {
    text_layer_destroy(s_chat_mic_layer);
  }
  s_chat_menu_layer = NULL;
  s_chat_back_layer = NULL;
  s_chat_title_layer = NULL;
  s_chat_mic_layer = NULL;
  s_chat_sync_layer = NULL;
}

static void prv_preview_window_load(Window *window) {
  Layer *root_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root_layer);
  GRect scroll_frame = GRect(0, TG_HEADER_HEIGHT + 4, bounds.size.w, bounds.size.h - TG_HEADER_HEIGHT - 8);

  s_preview_title_layer = prv_create_title_layer(root_layer, GRect(6, 0, bounds.size.w - 26, TG_HEADER_HEIGHT),
                                                 "Preview");
  s_preview_sync_layer = prv_create_sync_layer(root_layer, GRect(bounds.size.w - 18, 0, 14, TG_HEADER_HEIGHT));

  s_preview_scroll_layer = scroll_layer_create(scroll_frame);
  layer_add_child(root_layer, scroll_layer_get_layer(s_preview_scroll_layer));

  s_preview_text_layer = text_layer_create(GRect(8, 0, scroll_frame.size.w - 16, TG_PREVIEW_SCROLL_HEIGHT));
  text_layer_set_font(s_preview_text_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_background_color(s_preview_text_layer, GColorClear);
  text_layer_set_overflow_mode(s_preview_text_layer, GTextOverflowModeWordWrap);
  scroll_layer_add_child(s_preview_scroll_layer, text_layer_get_layer(s_preview_text_layer));

  prv_update_preview_contents();
  prv_set_preview_status(s_preview_status, s_preview_send_error);
  window_set_click_config_provider(window, prv_preview_click_config_provider);
}

static void prv_preview_window_unload(Window *window) {
  (void)window;
  scroll_layer_destroy(s_preview_scroll_layer);
  text_layer_destroy(s_preview_title_layer);
  text_layer_destroy(s_preview_sync_layer);
  text_layer_destroy(s_preview_text_layer);
  s_preview_scroll_layer = NULL;
  s_preview_title_layer = NULL;
  s_preview_sync_layer = NULL;
  s_preview_text_layer = NULL;
}

static void prv_settings_window_load(Window *window) {
  Layer *root_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root_layer);
  GRect menu_frame = GRect(0, TG_HEADER_HEIGHT, bounds.size.w, bounds.size.h - TG_HEADER_HEIGHT);

  s_settings_title_layer = prv_create_title_layer(root_layer, GRect(6, 0, bounds.size.w - 26, TG_HEADER_HEIGHT),
                                                  "Settings");
  s_settings_sync_layer = prv_create_sync_layer(root_layer, GRect(bounds.size.w - 18, 0, 14, TG_HEADER_HEIGHT));

  s_settings_menu_layer = menu_layer_create(menu_frame);
  menu_layer_set_callbacks(s_settings_menu_layer, NULL,
                           (MenuLayerCallbacks){
                               .get_num_rows = prv_settings_get_num_rows,
                               .draw_row = prv_settings_draw_row,
                               .select_click = prv_settings_select_click,
                           });
  menu_layer_set_click_config_onto_window(s_settings_menu_layer, window);
  layer_add_child(root_layer, menu_layer_get_layer(s_settings_menu_layer));
}

static void prv_settings_window_unload(Window *window) {
  (void)window;
  menu_layer_destroy(s_settings_menu_layer);
  text_layer_destroy(s_settings_title_layer);
  text_layer_destroy(s_settings_sync_layer);
  s_settings_menu_layer = NULL;
  s_settings_title_layer = NULL;
  s_settings_sync_layer = NULL;
}

static void prv_outbox_failed(DictionaryIterator *failed, AppMessageResult reason, void *context) {
  (void)failed;
  (void)context;
  APP_LOG(APP_LOG_LEVEL_WARNING, "Outbox failed: %d", (int)reason);
  if (reason == APP_MSG_NOT_CONNECTED || reason == APP_MSG_SEND_TIMEOUT) {
    prv_set_sync_status_from_string("desynced");
  }
}

static void prv_outbox_sent(DictionaryIterator *sent, void *context) {
  (void)sent;
  (void)context;
}

static void prv_inbox_dropped(AppMessageResult reason, void *context) {
  (void)context;
  APP_LOG(APP_LOG_LEVEL_WARNING, "Inbox dropped: %d", (int)reason);
}

static void prv_inbox_received(DictionaryIterator *iter, void *context) {
  Tuple *type_tuple = dict_find(iter, MESSAGE_KEY_MessageType);
  Tuple *payload_tuple = dict_find(iter, MESSAGE_KEY_PayloadJson);
  Tuple *request_tuple = dict_find(iter, MESSAGE_KEY_RequestId);
  Tuple *sync_tuple = dict_find(iter, MESSAGE_KEY_SyncState);
  const char *type = type_tuple ? type_tuple->value->cstring : NULL;
  const char *payload = payload_tuple ? payload_tuple->value->cstring : "";
  uint32_t request_id = request_tuple ? request_tuple->value->uint32 : 0;

  (void)context;

  if (sync_tuple) {
    prv_set_sync_status_from_string(sync_tuple->value->cstring);
  }

  if (!type) {
    return;
  }

  s_has_received_inbox = true;
  if (s_bootstrap_timer) {
    app_timer_cancel(s_bootstrap_timer);
    s_bootstrap_timer = NULL;
  }

  if (strcmp(type, TG_MSG_SYNC_STATUS) == 0) {
    return;
  }

  if (strcmp(type, TG_MSG_SETTINGS_STATE) == 0) {
    TgParsedSettingsState parsed;
    if (tg_parse_settings_state_payload(payload, &parsed)) {
      s_send_mode_auto = parsed.is_auto_send;
      s_preview_chat_message = parsed.preview_chat_message;
      s_has_session = parsed.has_session;
      s_has_auth_error = parsed.has_auth_error;
      if (s_settings_menu_layer) {
        menu_layer_reload_data(s_settings_menu_layer);
      }
      if (s_chat_list_menu_layer) {
        menu_layer_reload_data(s_chat_list_menu_layer);
      }
    }
    return;
  }

  if (strcmp(type, TG_MSG_CHAT_ITEM) == 0) {
    TgParsedChatItem parsed;

    if (request_id < TG_MAX_CHATS && tg_parse_chat_item_payload(payload, &parsed)) {
      s_chats[request_id].id = parsed.chat_id;
      s_chats[request_id].unread_count = parsed.unread_count;
      prv_copy_string(s_chats[request_id].title, sizeof(s_chats[request_id].title), parsed.title);
      prv_copy_string(s_chats[request_id].preview, sizeof(s_chats[request_id].preview), parsed.preview);
      if (request_id + 1 > s_chat_count) {
        s_chat_count = request_id + 1;
      }
      if (s_chat_list_menu_layer) {
        menu_layer_reload_data(s_chat_list_menu_layer);
      }
    }
    return;
  }

  if (strcmp(type, TG_MSG_CHAT_LIST_COMPLETE) == 0) {
    if (payload && payload[0] != '\0') {
      size_t parsed_count = 0;

      if (prv_parse_count_string(payload, TG_MAX_CHATS, &parsed_count)) {
        s_chat_count = parsed_count;
      }
    }
    if (s_chat_list_menu_layer) {
      menu_layer_reload_data(s_chat_list_menu_layer);
      if (s_chat_count > 0) {
        menu_layer_set_selected_index(s_chat_list_menu_layer, MenuIndex(0, 0), MenuRowAlignTop, false);
      }
    }
    return;
  }

  if (strcmp(type, TG_MSG_MESSAGE_ITEM) == 0) {
    TgParsedMessageItem parsed;

    if (request_id < TG_MAX_MESSAGES && tg_parse_message_item_payload(payload, &parsed)) {
      s_messages[request_id].show_sender = parsed.show_sender;
      s_messages[request_id].outgoing = parsed.outgoing;
      prv_copy_string(s_messages[request_id].sender, sizeof(s_messages[request_id].sender), parsed.sender);
      prv_copy_string(s_messages[request_id].text, sizeof(s_messages[request_id].text), parsed.text);
      if (request_id + 1 > s_message_count) {
        s_message_count = request_id + 1;
      }
      if (s_chat_menu_layer) {
        menu_layer_reload_data(s_chat_menu_layer);
      }
    }
    return;
  }

  if (strcmp(type, TG_MSG_CHAT_PAGE_COMPLETE) == 0) {
    if (s_chat_menu_layer) {
      menu_layer_reload_data(s_chat_menu_layer);
    }
    return;
  }

  if (strcmp(type, TG_MSG_SEND_RESULT) == 0) {
    TgParsedSendResult parsed;

    s_waiting_for_send_result = false;
    if (!tg_parse_send_result_payload(payload, &parsed)) {
      prv_set_preview_status("Send failed.", true);
      prv_show_preview_window();
      return;
    }

    if (parsed.ok) {
      prv_append_outgoing_message(s_preview_text);
      prv_copy_string(s_preview_text, sizeof(s_preview_text), "");
      if (window_stack_contains_window(s_preview_window)) {
        window_stack_remove(s_preview_window, true);
      }
    } else {
      prv_set_preview_status(parsed.detail, true);
      prv_show_preview_window();
    }
    return;
  }
}

static void prv_init(void) {
  app_message_register_inbox_received(prv_inbox_received);
  app_message_register_inbox_dropped(prv_inbox_dropped);
  app_message_register_outbox_failed(prv_outbox_failed);
  app_message_register_outbox_sent(prv_outbox_sent);
  app_message_open(512, 512);
  s_has_received_inbox = false;
  s_has_session = false;
  s_has_auth_error = false;

  s_chat_list_window = window_create();
  window_set_window_handlers(s_chat_list_window, (WindowHandlers){
                                                     .load = prv_chat_list_window_load,
                                                     .unload = prv_chat_list_window_unload,
                                                 });

  s_chat_window = window_create();
  window_set_window_handlers(s_chat_window, (WindowHandlers){
                                                .load = prv_chat_window_load,
                                                .unload = prv_chat_window_unload,
                                            });

  s_preview_window = window_create();
  window_set_window_handlers(s_preview_window, (WindowHandlers){
                                                   .load = prv_preview_window_load,
                                                   .unload = prv_preview_window_unload,
                                               });

  s_settings_window = window_create();
  window_set_window_handlers(s_settings_window, (WindowHandlers){
                                                    .load = prv_settings_window_load,
                                                    .unload = prv_settings_window_unload,
                                                });

#if defined(PBL_MICROPHONE)
  s_dictation_session = dictation_session_create(sizeof(s_preview_text), prv_dictation_callback, NULL);
  dictation_session_enable_confirmation(s_dictation_session, false);
#endif

  window_stack_push(s_chat_list_window, true);
  prv_schedule_bootstrap(700);
}

static void prv_deinit(void) {
  if (s_bootstrap_timer) {
    app_timer_cancel(s_bootstrap_timer);
  }
  prv_sync_status_animation_stop();

#if defined(PBL_MICROPHONE)
  if (s_dictation_session) {
    dictation_session_destroy(s_dictation_session);
  }
#endif

  window_destroy(s_settings_window);
  window_destroy(s_preview_window);
  window_destroy(s_chat_window);
  window_destroy(s_chat_list_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}
