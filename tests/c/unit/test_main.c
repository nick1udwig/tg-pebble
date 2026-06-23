#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../../src/c/core/message_grouping.h"
#include "../../../src/c/core/payload_parser.h"
#include "../../../src/c/core/sync_status.h"
#include "../../../src/c/core/unread_badge.h"

static int s_failures = 0;

#define ASSERT_TRUE(expr)                                                       \
  do {                                                                          \
    if (!(expr)) {                                                              \
      fprintf(stderr, "ASSERT_TRUE failed at %s:%d: %s\n", __FILE__, __LINE__,  \
              #expr);                                                           \
      s_failures++;                                                             \
    }                                                                           \
  } while (0)

#define ASSERT_STREQ(expected, actual)                                          \
  do {                                                                          \
    if (strcmp((expected), (actual)) != 0) {                                    \
      fprintf(stderr, "ASSERT_STREQ failed at %s:%d: expected '%s' got '%s'\n", \
              __FILE__, __LINE__, (expected), (actual));                        \
      s_failures++;                                                             \
    }                                                                           \
  } while (0)

static bool is_valid_utf8(const char *value) {
  const unsigned char *cursor = (const unsigned char *)value;
  size_t remaining = 0;
  unsigned char current;

  if (!value) {
    return false;
  }

  while ((current = *cursor++) != '\0') {
    if (remaining > 0) {
      if ((current & 0xC0U) != 0x80U) {
        return false;
      }
      remaining -= 1;
      continue;
    }

    if ((current & 0x80U) == 0x00U) {
      continue;
    }

    if ((current & 0xE0U) == 0xC0U) {
      remaining = 1;
      continue;
    }

    if ((current & 0xF0U) == 0xE0U) {
      remaining = 2;
      continue;
    }

    if ((current & 0xF8U) == 0xF0U) {
      remaining = 3;
      continue;
    }

    return false;
  }

  return remaining == 0;
}

static void test_should_show_sender(void) {
  ASSERT_TRUE(tg_should_show_sender(0, false, 10));
  ASSERT_TRUE(!tg_should_show_sender(10, true, 10));
  ASSERT_TRUE(tg_should_show_sender(10, true, 11));
}

static void test_format_unread_badge(void) {
  char buffer[8];

  tg_format_unread_badge(0, buffer, sizeof(buffer));
  ASSERT_STREQ("", buffer);

  tg_format_unread_badge(7, buffer, sizeof(buffer));
  ASSERT_STREQ("7", buffer);

  tg_format_unread_badge(145, buffer, sizeof(buffer));
  ASSERT_STREQ("99+", buffer);
}

static void test_sync_status_label(void) {
  ASSERT_STREQ("syncing", tg_sync_status_label(TG_SYNC_STATUS_SYNCING));
  ASSERT_STREQ("synced", tg_sync_status_label(TG_SYNC_STATUS_SYNCED));
  ASSERT_STREQ("desynced", tg_sync_status_label(TG_SYNC_STATUS_DESYNCED));
}

static void test_parse_chat_item_payload(void) {
  TgParsedChatItem item;

  ASSERT_TRUE(tg_parse_chat_item_payload("1001|Alice|See you soon|2", &item));
  ASSERT_TRUE(item.chat_id == 1001);
  ASSERT_TRUE(item.unread_count == 2);
  ASSERT_STREQ("Alice", item.title);
  ASSERT_STREQ("See you soon", item.preview);
}

static void test_parse_chat_item_payload_truncates_to_valid_utf8(void) {
  TgParsedChatItem item;
  const char *payload =
      "1001|Telegram Support \xE2\x9D\x97\xEF\xB8\x8FTelegram Support \xE2\x9D\x97\xEF\xB8\x8F|"
      "Login code: 31792. Do not share this code. \xE2\x9D\x97\xEF\xB8\x8F"
      "Login code: 31792. Do not share this code. \xE2\x9D\x97\xEF\xB8\x8F|12";

  ASSERT_TRUE(tg_parse_chat_item_payload(payload, &item));
  ASSERT_TRUE(item.chat_id == 1001);
  ASSERT_TRUE(item.unread_count == 12);
  ASSERT_TRUE(strlen(item.title) < TG_CHAT_TITLE_LENGTH);
  ASSERT_TRUE(strlen(item.preview) < TG_CHAT_PREVIEW_LENGTH);
  ASSERT_TRUE(is_valid_utf8(item.title));
  ASSERT_TRUE(is_valid_utf8(item.preview));
  ASSERT_TRUE(strncmp(item.preview, "Login code: 31792.", 18) == 0);
}

static void test_parse_message_item_payload(void) {
  TgParsedMessageItem item;

  ASSERT_TRUE(tg_parse_message_item_payload("Alice|1|0|Morning", &item));
  ASSERT_TRUE(item.show_sender);
  ASSERT_TRUE(!item.outgoing);
  ASSERT_STREQ("Alice", item.sender);
  ASSERT_STREQ("Morning", item.text);
}

static void test_parse_message_item_payload_truncates_to_valid_utf8(void) {
  TgParsedMessageItem item;
  const char *payload =
      "Telegram|1|0|Login code: 31792. Do not give this code to anyone, even if they say they are from Telegram!\n\n"
      "\xE2\x9D\x97\xEF\xB8\x8F"
      "This code can be used to log in to your Telegram account. We never ask it for anything else.";

  ASSERT_TRUE(tg_parse_message_item_payload(payload, &item));
  ASSERT_TRUE(item.show_sender);
  ASSERT_TRUE(!item.outgoing);
  ASSERT_STREQ("Telegram", item.sender);
  ASSERT_TRUE(strncmp(item.text, "Login code: 31792.", 18) == 0);
  ASSERT_TRUE(is_valid_utf8(item.text));
}

static void test_parse_send_result_payload(void) {
  TgParsedSendResult result;
  TgParsedSettingsState settings;

  ASSERT_TRUE(tg_parse_send_result_payload("ok", &result));
  ASSERT_TRUE(result.ok);
  ASSERT_STREQ("Sent.", result.detail);

  ASSERT_TRUE(tg_parse_send_result_payload("error|Fixture transport rejected the message.", &result));
  ASSERT_TRUE(!result.ok);
  ASSERT_STREQ("Fixture transport rejected the message.", result.detail);

  ASSERT_TRUE(tg_parse_settings_state_payload("auto|1", &settings));
  ASSERT_TRUE(settings.is_auto_send);
  ASSERT_TRUE(settings.preview_chat_message);
  ASSERT_TRUE(!settings.has_session);
  ASSERT_TRUE(!settings.has_auth_error);
  ASSERT_STREQ("phone", settings.auth_step);

  ASSERT_TRUE(tg_parse_settings_state_payload("preview|0|1|1", &settings));
  ASSERT_TRUE(!settings.is_auto_send);
  ASSERT_TRUE(!settings.preview_chat_message);
  ASSERT_TRUE(settings.has_session);
  ASSERT_TRUE(settings.has_auth_error);
  ASSERT_STREQ("signed_in", settings.auth_step);

  ASSERT_TRUE(tg_parse_settings_state_payload("preview|0|0|1", &settings));
  ASSERT_TRUE(!settings.has_session);
  ASSERT_TRUE(settings.has_auth_error);
  ASSERT_STREQ("error", settings.auth_step);

  ASSERT_TRUE(tg_parse_settings_state_payload("preview|0|0|0|password", &settings));
  ASSERT_TRUE(!settings.has_session);
  ASSERT_TRUE(!settings.has_auth_error);
  ASSERT_STREQ("password", settings.auth_step);
}

static void test_parse_send_result_payload_truncates_to_valid_utf8(void) {
  TgParsedSendResult result;
  const char *payload =
      "error|Telegram send failed: \xE2\x9D\x97\xEF\xB8\x8F"
      "Telegram send failed: \xE2\x9D\x97\xEF\xB8\x8F"
      "Telegram send failed: \xE2\x9D\x97\xEF\xB8\x8F";

  ASSERT_TRUE(tg_parse_send_result_payload(payload, &result));
  ASSERT_TRUE(!result.ok);
  ASSERT_TRUE(strlen(result.detail) < TG_STATUS_TEXT_LENGTH);
  ASSERT_TRUE(is_valid_utf8(result.detail));
  ASSERT_TRUE(strncmp(result.detail, "Telegram send failed:", 21) == 0);
}

int main(void) {
  test_should_show_sender();
  test_format_unread_badge();
  test_sync_status_label();
  test_parse_chat_item_payload();
  test_parse_chat_item_payload_truncates_to_valid_utf8();
  test_parse_message_item_payload();
  test_parse_message_item_payload_truncates_to_valid_utf8();
  test_parse_send_result_payload();
  test_parse_send_result_payload_truncates_to_valid_utf8();

  if (s_failures > 0) {
    fprintf(stderr, "%d C test(s) failed.\n", s_failures);
    return EXIT_FAILURE;
  }

  puts("C tests passed.");
  return EXIT_SUCCESS;
}
