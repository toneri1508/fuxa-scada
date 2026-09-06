# FUXA-mini

Bản SCADA tối giản, viết lại tinh thần của FUXA nhưng bỏ hết chức năng phụ
(alarm, log lịch sử, script, đa giao thức, đa người dùng...). Chỉ giữ lại
2 việc cốt lõi:

1. **Thiết kế giao diện** điều khiển/giám sát bằng cách kéo-thả các widget.
2. **Kết nối ổn định** tới PLC Mitsubishi qua **MC Protocol – 3E Frame (Binary), TCP/IP**,
   có tự động kết nối lại khi mất kết nối.

Công nghệ: 1 server Node.js (Express + WebSocket) + giao diện HTML/JS thuần,
không cần build, không cần framework nặng.

## Cài đặt & chạy

Đã kèm sẵn `node_modules` nên có thể chạy ngay không cần Internet:

```bash
cd fuxa-mini
npm start
# hoặc: node server.js
```

Mặc định server chạy ở `http://localhost:8080` (đổi bằng biến môi trường `PORT`
nếu cần, ví dụ `PORT=9000 node server.js`).

Nếu muốn cài lại từ đầu: `npm install` (cần 2 gói: `express`, `ws`).

## Sử dụng

1. Mở `http://localhost:8080` → **"Cài đặt kết nối PLC"**: nhập IP, port,
   timeout, chu kỳ quét (poll interval).
2. **"+ Tạo mới"** → đặt tên màn hình → vào trình thiết kế (Editor).
3. Kéo thả widget từ cột trái vào canvas:
   - **Đèn báo (Lamp)** – hiển thị trạng thái bit ON/OFF bằng màu.
   - **Nút nhấn (Button)** – ghi bit, 2 kiểu: *Giữ (momentary)* (nhấn=1,
     nhả=0) hoặc *Đảo trạng thái (toggle)*.
   - **Hiện số (Numeric Display)** – hiển thị giá trị thanh ghi (word).
   - **Nhập số (Numeric Input)** – nhập giá trị rồi ghi xuống PLC.
   - **Nhãn chữ / Hình chữ nhật** – trang trí, không gắn PLC.
4. Chọn widget → panel phải để gán **thiết bị + địa chỉ PLC** (vd `D100`,
   `M50`, `X1A`...) và tuỳ chỉnh màu/nhãn/đơn vị.
5. **Lưu**, sau đó **"Chạy thử"** hoặc bấm **"Chạy"** ở trang danh sách để
   vào màn hình vận hành (`runtime.html`) – nơi giám sát/điều khiển thực tế.

## Thiết bị PLC được hỗ trợ

| Ký hiệu | Loại thiết bị        | Kiểu   | Hệ địa chỉ nhập vào |
|---------|-----------------------|--------|----------------------|
| D       | Data Register          | word   | thập phân (vd `100`) |
| W       | Link Register          | word   | hex (vd `1A`)         |
| R       | File Register          | word   | thập phân             |
| M       | Internal Relay         | bit    | thập phân             |
| L       | Latch Relay            | bit    | thập phân             |
| B       | Link Relay             | bit    | hex                   |
| X       | Input                  | bit    | hex (vd `1A`)         |
| Y       | Output                 | bit    | hex (vd `1A`)         |

Đây là quy ước địa chỉ tiêu chuẩn của dòng Q/QnA/iQ-R khi dùng MC Protocol
3E Binary. Widget "Hiện số"/"Nhập số" chỉ dùng được với thiết bị kiểu word
(D, W, R); "Đèn báo"/"Nút nhấn" chỉ dùng được với thiết bị kiểu bit
(M, L, B, X, Y).

## Cách hoạt động (tóm tắt kỹ thuật)

- `src/mcProtocol.js`: dựng/parse khung 3E Binary (đọc/ghi hàng loạt theo
  "word units", ghi từng bit theo "bit units"). Đọc thiết bị bit được thực
  hiện bằng cách đọc theo **word** (16 điểm bit đóng gói trong 1 từ) để
  tránh rủi ro sai định dạng của lệnh đọc bit thuần tuý — đây là kỹ thuật
  phổ biến, đáng tin cậy trong thực tế.
- `src/plcClient.js`: quản lý 1 socket TCP duy nhất tới PLC, xếp hàng các
  request (MC protocol là hỏi/đáp tuần tự trên 1 socket), có timeout và
  **tự động kết nối lại** khi mất kết nối hoặc PLC không phản hồi.
- `src/plcService.js`: gom tất cả tag đang được các màn hình sử dụng, quét
  theo lô (gộp theo dải địa chỉ liền nhau để giảm số lượng request), phát
  giá trị thay đổi qua WebSocket tới mọi client đang mở màn hình runtime.
- 1 kết nối PLC dùng chung cho toàn bộ ứng dụng (không mở nhiều socket).

## ⚠️ Lưu ý quan trọng trước khi dùng với PLC thật

- Đã kiểm thử logic dựng/giải mã khung bằng PLC giả lập (mô phỏng đúng
  cách PLC thật đóng gói 16 bit/word) — toàn bộ luồng đọc/ghi word, đọc/ghi
  bit, gộp batch, mất kết nối/tự nối lại đều hoạt động đúng như thiết kế.
  Tuy nhiên **chưa được test trên phần cứng Mitsubishi thật**.
- Trên PLC (hoặc module Ethernet built-in), cần bật **MC Protocol, kiểu
  khung "3E Frame – Binary"** trên cổng/port đang cấu hình.
- Với dòng PLC khác nhau (Q, QnA, iQ-R, FX5U...), port mặc định và một vài
  chi tiết có thể khác — kiểm tra lại trong GX Works.
- Nên test với vài tag đơn giản (1 đèn, 1 số) trước khi dùng cho hệ thống
  thật.

## Giới hạn có chủ đích (đã lược bỏ so với FUXA gốc)

Không có: alarm, lưu lịch sử/trend, script/logic tuỳ biến, đa giao thức
(Siemens S7, Modbus...), quản lý user/phân quyền, đa dự án chạy song song,
import/export nâng cao, widget SVG phức tạp. Đây là bản tối giản đúng theo
yêu cầu — có thể mở rộng dần từ nền này nếu cần sau.

## Cấu trúc thư mục

```
fuxa-mini/
  server.js              # entry point
  src/
    mcProtocol.js         # dung/parse khung MC Protocol 3E Binary
    plcClient.js           # socket TCP + reconnect + hang doi request
    plcService.js          # dang ky tag, polling theo lo, API ghi
    projectStore.js        # luu/doc man hinh (JSON) trong ./projects
    configStore.js         # luu cau hinh ket noi PLC trong ./config
  public/
    index.html              # danh sach man hinh
    editor.html + js/editor.js     # trinh thiet ke keo-tha
    runtime.html + js/runtime.js   # man hinh giam sat/dieu khien
  projects/                # cac man hinh da luu (JSON)
  config/                  # cau hinh ket noi PLC (JSON)
```
