Pod::Spec.new do |s|
  s.name           = 'TapToPayEducation'
  s.version        = '1.0.0'
  s.summary        = "Presents Apple's Tap to Pay on iPhone merchant education."
  s.description    = "Presents Apple's Tap to Pay on iPhone merchant education (ProximityReaderDiscovery, iOS 18+)."
  s.license        = 'UNLICENSED'
  s.author         = 'Resneo'
  s.homepage       = 'https://www.resneo.com'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ProximityReader'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
