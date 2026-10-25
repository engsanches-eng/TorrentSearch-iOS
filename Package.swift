// swift-tools-version:5.9
// Pacote só com o núcleo (buscadores) — usado nos testes automáticos em Linux.
// O app iOS em si é gerado pelo XcodeGen (project.yml).
import PackageDescription

let package = Package(
    name: "TorrentSearchCore",
    platforms: [.iOS(.v16), .macOS(.v13)],
    products: [.library(name: "TorrentSearchCore", targets: ["TorrentSearchCore"])],
    dependencies: [
        .package(url: "https://github.com/scinfu/SwiftSoup.git", from: "2.7.0"),
        .package(url: "https://github.com/apple/swift-crypto.git", from: "3.0.0"),
    ],
    targets: [
        .target(
            name: "TorrentSearchCore",
            dependencies: [
                "SwiftSoup",
                .product(name: "Crypto", package: "swift-crypto", condition: .when(platforms: [.linux])),
            ]
        ),
        .testTarget(name: "TorrentSearchCoreTests", dependencies: ["TorrentSearchCore"], path: "Tests"),
    ]
)
