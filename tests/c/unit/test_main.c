#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../../../src/c/core/message_grouping.h"
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

int main(void) {
  test_should_show_sender();
  test_format_unread_badge();
  test_sync_status_label();

  if (s_failures > 0) {
    fprintf(stderr, "%d C test(s) failed.\n", s_failures);
    return EXIT_FAILURE;
  }

  puts("C tests passed.");
  return EXIT_SUCCESS;
}

