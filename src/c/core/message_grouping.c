#include "message_grouping.h"

bool tg_should_show_sender(int32_t previous_sender_id, bool has_previous, int32_t current_sender_id) {
  return !has_previous || previous_sender_id != current_sender_id;
}

