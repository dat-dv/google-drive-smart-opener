# Refactoring - Kiến Trúc Đồng Bộ & Phân Loại Trạng Thái

Tài liệu này trình bày chi tiết về cấu trúc thiết kế sau khi tái cấu trúc (refactoring) luồng xử lý mở và đồng bộ tài liệu từ Google Drive về Local và ngược lại.

---

## 1. Sơ Đồ Quy Trình Phân Loại Trạng Thái & Đồng Bộ (Pipeline Flowchart)

Quy trình hoạt động khi xảy ra một Database Hit (R2) khi mở một file:

```mermaid
flowchart TD
    %% Use Case Execution
    Start([Người dùng mở file localPath]) --> ResolveLocal[Resolve Absolute Path]
    ResolveLocal --> FindDoc{Tìm thấy trong DB DocRepo?}

    %% DB Miss Path
    FindDoc -- Miss --> DBMiss[Bắt đầu R3/R4 Recursive Search]

    %% DB Hit Path
    FindDoc -- Hit --> HashCalc[Tính mã MD5 Local & Drive]
    HashCalc --> ClassifyState[DocumentStateClassifier.classify]

    %% State Case Enum Routing
    ClassifyState --> RouteState{Phân loại DocumentStateCase}

    RouteState -- DRIVE_DELETED --> Strategy1[DriveDeletedStrategy]
    RouteState -- CONFLICT_BOTH_CHANGED --> Strategy2[ConflictStrategy]
    RouteState -- LOCAL_CHANGED_DRIVE_OLD --> Strategy3[LocalChangedStrategy]
    RouteState -- DRIVE_CHANGED_LOCAL_OLD --> Strategy4[DriveChangedStrategy]
    RouteState -- LOCAL_AND_DRIVE_IS_SAME --> OpenNormal[Mở trực tiếp file Canonical trên Drive]

    %% Strategy Actions
    Strategy1 --> Action1[Ghi nhận DRIVE_DELETED & Kết thúc]
    Strategy2 --> Action2[Hiện modal React yêu cầu giải quyết xung đột]
    Strategy3 --> Action3[Copy Local -> Drive, cập nhật DB & Mở]
    Strategy4 --> Action4[Copy Drive -> Local, cập nhật DB & Mở]

    %% Ends
    Action1 --> End([Hoàn thành])
    Action2 --> End
    Action3 --> OpenNormal
    Action4 --> OpenNormal
    OpenNormal --> End
```

---

## 2. Danh Sách Trạng Thái Đồng Bộ (`DocumentStateCase`)

Các trạng thái được phân loại tường minh bằng enum `DocumentStateCase`:

| Trạng thái (Enum)             | Điều kiện kích hoạt                                                                                                | Hành vi xử lý (Strategy)                                                                                      |
| :---------------------------- | :----------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ |
| **`DRIVE_DELETED`**           | File mirror trên Google Drive không còn tồn tại vật lý trên đĩa.                                                   | Đánh dấu trạng thái tài liệu là `DRIVE_DELETED` để giao diện phản hồi cho người dùng.                         |
| **`CONFLICT_BOTH_CHANGED`**   | Cả file Local và Drive đều có hash thay đổi khác với hash được lưu trong DB, đồng thời hash của hai bên khác nhau. | Hiển thị modal để người dùng chọn phương án giải quyết (ghi đè local, ghi đè drive, đổi tên giữ cả hai...).   |
| **`LOCAL_CHANGED_DRIVE_OLD`** | Chỉ có file Local có hash thay đổi so với DB. File Drive giữ nguyên hash cũ.                                       | Tự động sao chép (copy) dữ liệu từ Local đè lên file Drive để đảm bảo bản sao lưu luôn mới nhất trước khi mở. |
| **`DRIVE_CHANGED_LOCAL_OLD`** | Chỉ có file Drive có hash thay đổi so với DB. File Local giữ nguyên hash cũ.                                       | Tự động sao chép (copy) ngược lại từ Drive về Local để cập nhật nội dung mới nhất về máy trạm trước khi mở.   |
| **`LOCAL_AND_DRIVE_IS_SAME`** | Hash của cả hai bên khớp hoàn toàn với bản ghi cuối trong Database hoặc chưa có thay đổi nào.                      | Mở trực tiếp file canonical bằng ứng dụng hệ điều hành mà không cần đồng bộ hay cảnh báo.                     |

---

## 3. Sơ Đồ Cấu Trúc Các Lớp (Class & Dependency Cleanliness)

Tách biệt trách nhiệm rõ ràng theo mô hình Clean Architecture:

```mermaid
classDiagram
    class OpenDocumentUseCase {
        +execute(localPath)
        -syncStrategies: DocumentSyncStrategy[]
    }

    class DocumentStateClassifier {
        +classify(doc, drivePath, localHash, driveHash) DocumentStateCase
    }

    class DocumentSyncStrategy {
        <<interface>>
        +canHandle(context) Promise
        +execute(context) Promise
    }

    class DriveDeletedStrategy {
        +canHandle()
        +execute()
    }
    class ConflictStrategy {
        +canHandle()
        +execute()
    }
    class LocalChangedStrategy {
        +canHandle()
        +execute()
    }
    class DriveChangedStrategy {
        +canHandle()
        +execute()
    }

    class SharedMime {
        +guessMimeType(filename)
    }

    OpenDocumentUseCase --> DocumentStateClassifier : sử dụng để phân loại
    OpenDocumentUseCase --> DocumentSyncStrategy : chứa danh sách chiến lược đồng bộ

    DocumentSyncStrategy <|.. DriveDeletedStrategy
    DocumentSyncStrategy <|.. ConflictStrategy
    DocumentSyncStrategy <|.. LocalChangedStrategy
    DocumentSyncStrategy <|.. DriveChangedStrategy

    OpenDocumentUseCase ..> SharedMime : import
    DriveWatcher ..> SharedMime : import
```

---

## 4. Các Tối Ưu Khác (Clean Code)

- **Loại bỏ trùng lặp logic**: Rút gọn hàm đoán định MIME type `guessMimeType` dùng chung vào `@shared/utils/mime` thay vì copy-paste ở nhiều class.
- **Tách biệt Adapter**: Di chuyển class `ElectronUserInteractor` ra khỏi file bootstrap khởi động ứng dụng chính `src/main/index.ts` để đảm bảo file chính gọn gàng và dễ bảo trì.
