#include "payload_parser.h"

#include <string.h>

static size_t prv_utf8_prefix_length(const char *start, size_t length) {
  size_t offset = 0;
  size_t codepoint_length = 0;
  size_t continuation_index = 0;
  unsigned char current;

  while (offset < length) {
    current = (unsigned char)start[offset];
    if ((current & 0x80U) == 0x00U) {
      offset += 1;
      continue;
    }

    if ((current & 0xE0U) == 0xC0U) {
      codepoint_length = 2;
    } else if ((current & 0xF0U) == 0xE0U) {
      codepoint_length = 3;
    } else if ((current & 0xF8U) == 0xF0U) {
      codepoint_length = 4;
    } else {
      break;
    }

    if (offset + codepoint_length > length) {
      break;
    }

    for (continuation_index = 1; continuation_index < codepoint_length; continuation_index += 1) {
      if ((((unsigned char)start[offset + continuation_index]) & 0xC0U) != 0x80U) {
        return offset;
      }
    }

    offset += codepoint_length;
  }

  return offset;
}

static void prv_copy_field(char *dest, size_t dest_size, const char *start, size_t length) {
  size_t copy_length = length;

  if (dest_size == 0) {
    return;
  }

  if (copy_length >= dest_size) {
    copy_length = dest_size - 1;
  }

  copy_length = prv_utf8_prefix_length(start, copy_length);

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

bool tg_parse_settings_state_payload(const char *payload, TgParsedSettingsState *out) {
  const char *cursor = payload;
  char send_mode_buffer[16];
  char preview_buffer[4];
  char session_buffer[4];
  char auth_error_buffer[4];

  if (!payload || !out) {
    return false;
  }

  if (!prv_next_field(&cursor, send_mode_buffer, sizeof(send_mode_buffer))) {
    return false;
  }

  if (strcmp(send_mode_buffer, "auto") == 0) {
    out->is_auto_send = true;
  } else if (strcmp(send_mode_buffer, "preview") == 0) {
    out->is_auto_send = false;
  } else {
    return false;
  }

  if (!prv_next_field(&cursor, preview_buffer, sizeof(preview_buffer))) {
    out->preview_chat_message = false;
    out->has_session = false;
    out->has_auth_error = false;
    return true;
  }

  out->preview_chat_message = prv_parse_bool_field(preview_buffer);
  if (!prv_next_field(&cursor, session_buffer, sizeof(session_buffer))) {
    out->has_session = false;
    out->has_auth_error = false;
    return true;
  }

  out->has_session = prv_parse_bool_field(session_buffer);
  if (!prv_next_field(&cursor, auth_error_buffer, sizeof(auth_error_buffer))) {
    out->has_auth_error = false;
    return true;
  }

  out->has_auth_error = prv_parse_bool_field(auth_error_buffer);
  return true;
}
