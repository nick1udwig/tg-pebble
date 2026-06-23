#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

#define TG_CHAT_TITLE_LENGTH 32
#define TG_CHAT_PREVIEW_LENGTH 64
#define TG_MESSAGE_SENDER_LENGTH 24
#define TG_MESSAGE_TEXT_LENGTH 96
#define TG_STATUS_TEXT_LENGTH 96
#define TG_AUTH_STEP_LENGTH 16

typedef struct {
  int32_t chat_id;
  unsigned int unread_count;
  char title[TG_CHAT_TITLE_LENGTH];
  char preview[TG_CHAT_PREVIEW_LENGTH];
} TgParsedChatItem;

typedef struct {
  bool show_sender;
  bool outgoing;
  char sender[TG_MESSAGE_SENDER_LENGTH];
  char text[TG_MESSAGE_TEXT_LENGTH];
} TgParsedMessageItem;

typedef struct {
  bool ok;
  char detail[TG_STATUS_TEXT_LENGTH];
} TgParsedSendResult;

typedef struct {
  bool is_auto_send;
  bool preview_chat_message;
  bool has_session;
  bool has_auth_error;
  char auth_step[TG_AUTH_STEP_LENGTH];
} TgParsedSettingsState;

bool tg_parse_chat_item_payload(const char *payload, TgParsedChatItem *out);
bool tg_parse_message_item_payload(const char *payload, TgParsedMessageItem *out);
bool tg_parse_send_result_payload(const char *payload, TgParsedSendResult *out);
bool tg_parse_settings_state_payload(const char *payload, TgParsedSettingsState *out);
