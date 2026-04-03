#include "unread_badge.h"

#include <stdio.h>

void tg_format_unread_badge(unsigned int count, char *buffer, size_t buffer_size) {
  if (!buffer || buffer_size == 0) {
    return;
  }

  if (count == 0) {
    buffer[0] = '\0';
    return;
  }

  if (count > 99) {
    (void)snprintf(buffer, buffer_size, "99+");
    return;
  }

  (void)snprintf(buffer, buffer_size, "%u", count);
}

