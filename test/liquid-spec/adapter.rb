# frozen_string_literal: true

require "liquid/spec/cli/adapter_dsl"

SERVER = File.expand_path("../../bin/liquid-spec-server.mts", __dir__)

LiquidSpec.setup do |ctx|
  require "liquid"
  require "liquid/spec/json_rpc/adapter"

  command = LiquidSpec.cli_options[:command] || "node #{SERVER}"
  timeout = LiquidSpec.cli_options[:timeout]&.to_i || 5
  ctx[:adapter] = Liquid::Spec::JsonRpc::Adapter.new(command, timeout: timeout)
  ctx[:adapter].start
  at_exit { ctx[:adapter]&.shutdown }
end

LiquidSpec.configure do |config|
  # LIQUID_SPEC_ERROR_MODES selects another profile: the runner only runs strict2 when both strict2 and
  # strict are declared, so the strict contract of a [strict2, strict] fixture is exercised by `strict,lax`
  config.error_modes = (ENV["LIQUID_SPEC_ERROR_MODES"] || "strict2,strict,lax").split(",").map(&:to_sym)
  config.render_error_modes = [:raise, :inline]
  # LIQUID_SPEC_PROFILE=shopify_theme renders with the hosted profile, which implements the shopify_* features
  hosted = ENV["LIQUID_SPEC_PROFILE"] == "shopify_theme"
  config.missing_features = [
    # JSON cannot transport these values (docs/json-rpc-protocol.md, "Transport Limitations")
    :ruby_types,
    :ruby_drops,
    :drop_class_output,
    :binary_data,
    :template_factory,
    # portable, but the server does not yet proxy drop_get/drop_call/drop_iterate callbacks
    :drops,
  ]
  # hosted Shopify extensions, outside the core profile
  config.missing_features += %i[
    shopify_tags
    shopify_objects
    shopify_filters
    shopify_includes
    shopify_blank
    shopify_error_handling
    shopify_error_format
    shopify_string_access
  ] unless hosted
end

LiquidSpec.compile do |ctx, source, options|
  ctx[:adapter].spec_context = ctx
  ctx[:template_id] = ctx[:adapter].compile(source, options)
end

LiquidSpec.render do |ctx, assigns, options|
  ctx[:adapter].spec_context = ctx
  ctx[:adapter].render(ctx[:template_id], assigns, options)
end
