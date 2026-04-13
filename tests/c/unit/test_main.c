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

static void test_parse_message_item_payload(void) {
  TgParsedMessageItem item;

  ASSERT_TRUE(tg_parse_message_item_payload("Alice|1|0|Morning", &item));
  ASSERT_TRUE(item.show_sender);
  ASSERT_TRUE(!item.outgoing);
  ASSERT_STREQ("Alice", item.sender);
  ASSERT_STREQ("Morning", item.text);
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

  ASSERT_TRUE(tg_parse_settings_state_payload("preview|0|1|1", &settings));
  ASSERT_TRUE(!settings.is_auto_send);
  ASSERT_TRUE(!settings.preview_chat_message);
  ASSERT_TRUE(settings.has_session);
  ASSERT_TRUE(settings.has_auth_error);
}

int main(void) {
  test_should_show_sender();
  test_format_unread_badge();
  test_sync_status_label();
  test_parse_chat_item_payload();
  test_parse_message_item_payload();
  test_parse_send_result_payload();

  if (s_failures > 0) {
    fprintf(stderr, "%d C test(s) failed.\n", s_failures);
    return EXIT_FAILURE;
  }

  puts("C tests passed.");
  return EXIT_SUCCESS;
}
