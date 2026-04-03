#include <pebble.h>

static Window *s_main_window;
static TextLayer *s_title_layer;
static TextLayer *s_body_layer;

static void prv_main_window_load(Window *window) {
  Layer *root_layer = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root_layer);

  s_title_layer = text_layer_create(GRect(8, 8, bounds.size.w - 16, 28));
  text_layer_set_text(s_title_layer, "TG Pebble");
  text_layer_set_font(s_title_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text_alignment(s_title_layer, GTextAlignmentCenter);
  text_layer_set_background_color(s_title_layer, GColorClear);
  layer_add_child(root_layer, text_layer_get_layer(s_title_layer));

  s_body_layer = text_layer_create(GRect(8, 44, bounds.size.w - 16, bounds.size.h - 52));
  text_layer_set_text(
      s_body_layer,
      "Project scaffold.\n\nThe watch UI, chat list, and sync flows will be built on top of this shell.");
  text_layer_set_font(s_body_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text_alignment(s_body_layer, GTextAlignmentLeft);
  text_layer_set_background_color(s_body_layer, GColorClear);
  layer_add_child(root_layer, text_layer_get_layer(s_body_layer));
}

static void prv_main_window_unload(Window *window) {
  text_layer_destroy(s_title_layer);
  text_layer_destroy(s_body_layer);
}

static void prv_init(void) {
  s_main_window = window_create();
  window_set_window_handlers(s_main_window, (WindowHandlers){
                                                 .load = prv_main_window_load,
                                                 .unload = prv_main_window_unload,
                                             });
  window_stack_push(s_main_window, true);
}

static void prv_deinit(void) {
  window_destroy(s_main_window);
}

int main(void) {
  prv_init();
  app_event_loop();
  prv_deinit();
}

