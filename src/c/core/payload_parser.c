#include "payload_parser.h"

#include <string.h>

static void prv_copy_field(char *dest, size_t dest_size, const char *start, size_t length) {
  size_t copy_length = length;

  if (dest_size == 0) {
    return;
  }

  if (copy_length >= dest_size) {
    copy_length = dest_size - 1;
  }

  if (copy_length > 0) {
    memcpy(dest, start, copy_length);
  }

  dest[copy_length] = '\0';
}

static bool prv_next_field(const char **cursor, char *buffer, size_t buffer_size) {
  const char *start = *cursor;
  const char *separator = strchr(start, '|');

  if (!start) {
    return false;
  }

  if (separator) {
    prv_copy_field(buffer, buffer_size, start, (size_t)(separator - start));
    *cursor = separator + 1;
    return true;
  }

  prv_copy_field(buffer, buffer_size, start, strlen(start));
  *cursor = start + strlen(start);
  return true;
}

static bool prv_parse_bool_field(const char *field) {
  return field && field[0] == '1';
}

static bool prv_parse_uint_field(const char *field, uint32_t *out) {
  uint32_t value = 0;
  size_t index = 0;

  if (!field || !field[0] || !out) {
    return false;
  }

  while (field[index] != '\0') {
    if (field[index] < '0' || field[index] > '9') {
      return false;
    }

    value = (value * 10U) + (uint32_t)(field[index] - '0');
    index += 1;
  }

  *out = value;
  return true;
}

bool tg_parse_chat_item_payload(const char *payload, TgParsedChatItem *out) {
  const char *cursor = payload;
  char id_buffer[16];
  char unread_buffer[16];
  uint32_t chat_id = 0;
  uint32_t unread_count = 0;

  if (!payload || !out) {
    return false;
  }

  if (!prv_next_field(&cursor, id_buffer, sizeof(id_buffer)) ||
      !prv_next_field(&cursor, out->title, sizeof(out->title)) ||
      !prv_next_field(&cursor, out->preview, sizeof(out->preview)) ||
      !prv_next_field(&cursor, unread_buffer, sizeof(unread_buffer))) {
    return false;
  }

  if (!prv_parse_uint_field(id_buffer, &chat_id) || !prv_parse_uint_field(unread_buffer, &unread_count)) {
    return false;
  }

  out->chat_id = (int32_t)chat_id;
  out->unread_count = (unsigned int)unread_count;
  return true;
}

bool tg_parse_message_item_payload(const char *payload, TgParsedMessageItem *out) {
  const char *cursor = payload;
  char show_sender_buffer[4];
  char outgoing_buffer[4];

  if (!payload || !out) {
    return false;
  }

  if (!prv_next_field(&cursor, out->sender, sizeof(out->sender)) ||
      !prv_next_field(&cursor, show_sender_buffer, sizeof(show_sender_buffer)) ||
      !prv_next_field(&cursor, outgoing_buffer, sizeof(outgoing_buffer)) ||
      !prv_next_field(&cursor, out->text, sizeof(out->text))) {
    return false;
  }

  out->show_sender = prv_parse_bool_field(show_sender_buffer);
  out->outgoing = prv_parse_bool_field(outgoing_buffer);
  return true;
}

bool tg_parse_send_result_payload(const char *payload, TgParsedSendResult *out) {
  const char *cursor = payload;
  char status_buffer[16];

  if (!payload || !out) {
    return false;
  }

  if (!prv_next_field(&cursor, status_buffer, sizeof(status_buffer))) {
    return false;
  }

  out->ok = strcmp(status_buffer, "ok") == 0;

  if (out->ok) {
    prv_copy_field(out->detail, sizeof(out->detail), "Sent.", strlen("Sent."));
    return true;
  }

  if (!prv_next_field(&cursor, out->detail, sizeof(out->detail))) {
    prv_copy_field(out->detail, sizeof(out->detail), "Send failed.", strlen("Send failed."));
  }

  return true;
}

bool tg_parse_send_mode_payload(const char *payload, bool *is_auto_send) {
  if (!payload || !is_auto_send) {
    return false;
  }

  if (strcmp(payload, "auto") == 0) {
    *is_auto_send = true;
    return true;
  }

  if (strcmp(payload, "preview") == 0) {
    *is_auto_send = false;
    return true;
  }

  return false;
}
