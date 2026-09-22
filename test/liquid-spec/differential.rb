# frozen_string_literal: true

# Renders JSON-lines cases `{"template", "mode", "environment", "partials"}` with the pinned
# reference engine for bin/liquid-diff.mts, one JSON result per line.

require "json"
require "timeout"
require "liquid"

class MapFileSystem
  def initialize(files)
    @files = files
  end

  def read_template_file(name)
    @files.fetch(name.to_s) { raise Liquid::FileSystemError, "Could not find asset #{name}" }
  end
end

$stdout.sync = true
$stdin.each_line do |line|
  request = JSON.parse(line)
  result = begin
    Timeout.timeout(5) do
      template = Liquid::Template.parse(request["template"], error_mode: request["mode"].to_sym, line_numbers: true)
      context = Liquid::Context.build(
        environments: [request["environment"]],
        registers: Liquid::Registers.new(file_system: MapFileSystem.new(request["partials"] || {})),
      )
      { "output" => template.render(context) }
    end
  rescue Liquid::SyntaxError => e
    { "parse_error" => e.message }
  rescue Timeout::Error
    { "timeout" => true }
  rescue StandardError, SystemStackError => e
    { "render_error" => "#{e.class}: #{e.message}" }
  end
  puts JSON.generate(result)
rescue JSON::GeneratorError, Encoding::UndefinedConversionError => e
  puts JSON.generate({ "render_error" => "unencodable output: #{e.message}" })
end
