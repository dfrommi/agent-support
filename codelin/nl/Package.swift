// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "nl-query",
    platforms: [.macOS(.v26)],
    targets: [
        .executableTarget(
            name: "nl-query",
            path: "Sources/nl-query",
            linkerSettings: [
                .linkedFramework("FoundationModels"),
            ]
        ),
    ]
)
