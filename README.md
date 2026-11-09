# Bàn Tròn 3D — Giai đoạn 8: Mobile và phát hành

**Web:** https://phihung2000.github.io/game_ban_tron/  
**Repository:** https://github.com/phihung2000/game_ban_tron

Đã có project Capacitor Android/iOS, joystick cảm ứng, chọn ghế bằng chạm, chat theo bàn phím,
menu mobile, mic nhanh, LOD nhân vật và tự chọn chất lượng Thấp trên thiết bị cảm ứng/native.

```bash
npm install
npm exec --yes --package=node@22 --call "npm run dev"
```

Đóng gói bằng `npm run mobile:sync`, mở IDE bằng `npm run mobile:android` hoặc `npm run mobile:ios`.
Máy build native cần JDK 21/Android SDK 36 hoặc Xcode 26+; iOS app yêu cầu iOS 17.4+.
GitHub Actions có workflow Pages và build APK debug/AAB unsigned/iOS Simulator app.

Xem [hướng dẫn Android/iOS, phát hành web và checklist Google Play/App Store](docs/PHAT_HANH_MOBILE.md).
**Trước khi nộp Store cần hoàn thiện privacy policy, Terms, xóa tài khoản, vận hành kiểm duyệt và signing.**
Các mục đó được liệt kê rõ trong checklist; workflow không tự gửi app lên Store.

Giai đoạn 8 không thêm SQL. Dự án mới cần lần lượt phase2.sql → phase4.sql → phase7.sql.
Giữ `.env` ngoài Git; chỉ URL và khóa Supabase public được dùng để build frontend.

```bash
npm test
npm run check:release
npm run test:mobile
```

React + TypeScript + Vite + Three.js. Kế thừa đăng nhập, sảnh phòng,
WebRTC full-mesh, đồng bộ nhân vật và ghế từ giai đoạn 2, chat/emote từ giai đoạn 3.
Giai đoạn 4 có ấm trà, ly, đĩa bánh/kẹo, thao tác, hơi nóng và âm thanh.
Giai đoạn 5 bổ sung micro, audio WebRTC theo khoảng cách, âm thanh 3D và băng thông.
Giai đoạn 6 bổ sung hồ phản chiếu, suối, cây/cỏ/hoa theo cụm instancing, đá, đường mòn,
gió shader, HDRI, ngày đêm, thời tiết, chim/bướm/lá rơi và âm thanh môi trường 3D.
Nhân vật vẫn dùng hình khối và animation thủ tục.
Nhân vật vẫn dùng hình học thủ tục, chưa có model glTF.

**Nâng từ giai đoạn 6: chạy toàn bộ `supabase/phase7.sql` trong SQL Editor, rồi tải lại mọi tab.**
Giữ `.env` và dữ liệu hiện có; không thêm thư viện. Migration phase7 có thể chạy lại.
Nếu chưa nâng giai đoạn 4: giữ nguyên .env/database, chạy `supabase/phase4.sql` trong SQL Editor.
Không chạy lại phase2.sql. Migration mới không xóa phòng, hồ sơ hoặc ghế;
chạy lại phase4.sql cũng không nạp đầy lại ấm/đĩa. Mở lại các tab sau nâng cấp để mọi máy dùng cùng phiên bản.
Không thêm thư viện. Chạy `npm run dev` để sử dụng.

## Giai đoạn 7: cài đặt và sử dụng

1. Trong Supabase Dashboard → SQL Editor, chạy nguyên file `supabase/phase7.sql`.
   Dự án mới chạy lần lượt phase2.sql → phase4.sql → phase7.sql. Dự án đã ở giai đoạn 6 chỉ chạy phase7.sql.
   Không chạy lại phase2.sql trên database đang dùng. Không chạy lại phase4.sql sau phase7.sql vì nó thay định nghĩa hàm.
2. Tải lại mọi trình duyệt/tab đang mở. Phiên cũ chưa có khóa phục hồi: rời phòng và vào lại một lần để nhận khóa mới.
3. Dùng Node từ 22.12 trở lên rồi `npm run dev`. Nếu máy đang có Node 20, chạy:

```bash
npm exec --yes --package=node@22 --call "npm run dev"
```

4. Trong **Người trong phòng**, mỗi người có nút **Tắt tiếng**, **Chặn**, **Báo cáo**.
   Host có thêm **Mời ra**, với bước xác nhận người cụ thể trước khi thực hiện.
5. Phần **Kết nối và phục hồi** hiện trạng thái từng peer, số lần thử và thời điểm checkpoint.
   Khi mạng đã sửa mà WebRTC chưa nối, bấm **Thử lại P2P và phòng**.

### Tắt tiếng, chặn và báo cáo

- Tắt tiếng là lựa chọn trên máy bạn: gain voice của người đó về 0 và biểu tượng đang nói bị ẩn.
  Bạn vẫn nhận chat; người đó vẫn có thể nghe bạn. Mute không dừng RTP đang nhận.
- Chặn ẩn nhân vật, chat, emote và tiếng của tài khoản đó trên máy bạn; audio PC giữa hai người bị đóng,
  nên hai bên không truyền mic cho nhau. Danh sách phòng vẫn giữ họ để bạn có thể bỏ chặn/báo cáo.
  Kết nối dữ liệu ghế/snapshot cần thiết vẫn hoạt động, kể cả khi người bị chặn là host.
- Lựa chọn lưu theo tài khoản người chơi trong localStorage, không theo UUID peer tạm thời.
  Đổi peer/reload của cùng tài khoản không lách được lựa chọn này. Bỏ chặn giữ lựa chọn mute trước đó.
- Báo cáo gồm lý do và mô tả tối đa 500 ký tự. RPC lấy danh tính người gửi từ `auth.uid()`,
  xác minh cả người gửi và đối tượng đang trong phòng, rồi ghi `public.reports`.
  Không tự tải lịch sử chat hoặc ghi âm. Báo cáo không tự động phạt người chơi.
- RLS chỉ cho người gửi đọc báo cáo của chính họ; host không có quyền đọc báo cáo người khác.
  Việc xem toàn bộ báo cáo thực hiện trong Supabase SQL Editor/Table Editor bằng tài khoản quản trị dự án.
- Host kick được kiểm tra ở database theo quyền sở hữu peer và `host_epoch`, không tin một gói “kick” P2P.
  Tài khoản bị kick không thể vào lại phòng đó bằng mã mời, peer mới hoặc khóa phục hồi cũ.
  Mọi peer của tài khoản bị kick được loại; các máy còn lại xác minh lại thành viên qua RPC.
  Với client chính thức, mic của người bị kick dừng khi nhận xác nhận DB, thường trong một heartbeat 4 giây.
  Giới hạn theo tài khoản: người tạo tài khoản ẩn danh khác có danh tính mới.

Xem báo cáo bằng SQL Editor:

```sql
select id, created_at, room_id, reporter_user_id, target_user_id, reason, details
from public.reports
order by created_at desc
limit 100;
```

### Phòng riêng, snapshot và chuyển host

Mã mời ngẫu nhiên 128 bit được tạo khi mở phòng. Database giữ hash, không cho client đọc hash hoặc
liệt kê phòng riêng. Vào phòng riêng lần đầu phải có mã đúng; không thể chỉ biết room UUID là vào được.
Khóa phục hồi khác mã mời: chỉ cấp cho một peer đã vào phòng, ràng buộc cùng Supabase user,
được lưu ở sessionStorage của tab và có hạn 24 giờ. Không đưa khóa vào URL hay log.
Rời phòng chủ động/đăng xuất xóa khóa khỏi tab; rời phòng chủ động cũng thu hồi khóa ở DB.

Host gửi checkpoint vào `rooms.checkpoint` **mỗi 30 giây**. Nó chứa vị trí gần nhất mà host đã nhận,
snapshot ghế/bàn, nhiệm kỳ và thời điểm lưu. RPC lấy snapshot ghế/bàn trực tiếp từ database để tránh
một client ghi đè bằng bản cũ. Vị trí chỉ lưu trong checkpoint định kỳ; không đưa vị trí lên Supabase Realtime.
Ghế và trà/bánh tiếp tục được commit trước khi xác nhận từng hành động, nên không phải chờ 30 giây.
Khi host chết, vị trí trong checkpoint có thể cũ tối đa khoảng 30 giây từ lần lưu thành công;
ghế/bàn lấy bản commit mới nhất trong `rooms.snapshot`, không rollback về checkpoint cũ.

Heartbeat 4 giây, lease 20 giây. Host rời chủ động được thay sau RPC rời phòng;
đóng tab/tắt máy/mất mạng được thay khi lease hết, thường trong khoảng 20–24 giây khi DB còn truy cập được.
DB khóa hàng phòng, chọn thành viên còn hoạt động có `join_order` nhỏ nhất và tăng `host_epoch`.
Host mới nạp snapshot/checkpoint từ kết quả RPC Supabase, đối chiếu thành viên rồi phát snapshot qua P2P.
Host cũ không ghi được ghế/bàn/checkpoint bằng nhiệm kỳ cũ. Người đã hết lease vào lại nhận thứ tự mới,
không tự lấy lại quyền host hoặc ghế có người khác chiếm. Các kết nối audio giữa người còn lại được giữ.

Nếu mọi người đều mất đường tới Supabase, ứng dụng chờ phục hồi quyền host từ DB;
không bầu một host riêng chỉ bằng phỏng đoán P2P vì có thể sinh hai trọng tài.
Một host chủ ý sửa client vẫn có thể xử lý sai luật chơi; P2P không cung cấp trọng tài độc lập.
Các kiểm tra quyền/kiểu dữ liệu/epoch ở DB ngăn ghi trái quyền, không chứng minh tính trung thực của host.

### Rớt mạng và WebRTC thất bại

Ứng dụng giữ phòng hiện tại khi mất mạng, hiện trạng thái rõ ràng và tự heartbeat lại có backoff,
tối đa khoảng 30 giây giữa các lần thử; sự kiện trình duyệt báo có mạng sẽ thử ngay.
Nếu lease đã hết, gọi `resume_room` bằng khóa phục hồi: đúng tài khoản và khóa mới vào lại được phòng riêng.
Phòng đang đầy sẽ chờ chỗ trống rồi thử tiếp; tài khoản bị kick hoặc khóa hết hạn dừng phục hồi.
Tải lại trang trong cùng tab tự phục hồi; nếu phục hồi lúc tải trang thất bại, sảnh có nút **Thử vào lại phòng trước**.
Nếu đóng hẳn tab, sessionStorage có thể bị xóa; mở tab mới thì dùng mã mời để vào như bình thường.
Mic không tự bật lại sau tải trang.

WebRTC dùng phiên PC mới khi kết nối thật sự thất bại. `disconnected` được chờ 6 giây trước khi thay,
kết nối mới có 20 giây để mở kênh. Chỉ một đầu UUID tạo offer; đầu còn lại chờ để tránh xung đột.
Backoff khoảng 1,5/3/6/12/24 giây cộng jitter; tối đa 5 lần thất bại liên tiếp.
Kết nối ổn định 10 giây xóa bộ đếm. Nút thử lại đặt lại bộ đếm cho các peer chưa nối, giữ peer đang tốt.
Thử lại thủ công dùng được ở cả hai đầu; nếu hai offer xung đột thì ưu tiên UUID lớn.
Signaling websocket hỏng vẫn đọc bù SDP/ICE qua REST; không dùng REST cho chat/animation/vị trí.
STUN không bảo đảm xuyên mọi NAT/tường lửa; dùng chỗ TURN trong `.env.example` khi mạng yêu cầu chuyển tiếp.
Chat vẫn gửi cho người đang kết nối, bảng hiện thông báo khi còn thiếu peer.

### Giới hạn tốc độ

`src/network/rateLimit.ts` giới hạn ở cả phía gửi và nhận. Kiểm tra tổng byte/gói trước khi parse JSON,
kiểm tra loại trước khi đưa vào hàng đợi host; dữ liệu hỏng và gói lạ bị bỏ.
Mỗi peer có ngân sách riêng, không làm mất quota người khác. Một peer liên tục vượt giới hạn bị tạm ngắt 60 giây.
Giới hạn chỉ bảo vệ xử lý/nhận ở client chính thức; không ngăn một client tự sửa cố gửi dữ liệu trên đường mạng.

| Loại | Tốc độ hồi mỗi giây | Burst tối đa |
| --- | --- | --- |
| Vị trí / keyframe | 15 / 4 | 20 / 8 |
| Chat / emote | 1 / 2 | 1 / 2 |
| Yêu cầu ghế / trà bánh | 2 / 2 | 3 / 3 |
| Snapshot / đồng hồ bàn | 4 / 2 | 8 / 3 |
| Hello / nhắc cập nhật thành viên | 0,5 / 0,5 | 3 / 2 |
| Trả lời ghế / trả lời trà bánh | 3 / 4 | 6 / 8 |
| Voice status / SDP-ICE voice | 6 / 16 | 12 / 64 |

Tổng mỗi peer: 80 gói/s, burst 120; tối đa 64 KiB/gói; ngân sách 128 KiB/s, burst 256 KiB.
Kênh gửi dừng ghi thêm khi bufferedAmount vượt 128 KiB. Các map lịch sử/candidate/hàng đợi có trần và dọn khi rời.
Audio RTP không đi qua token bucket tin nhắn; Opus/giới hạn peer voice tiếp tục quản lý băng thông audio.

Ở Supabase, quota nằm trong cột nội bộ `profiles.rate_state` (client không đọc/sửa được):
tạo phòng 3/phút burst 3; vào phòng 20/phút burst 12; phục hồi 12/phút burst 6;
heartbeat 1/s burst 8; commit host 20/s burst 30; checkpoint 0,2/s burst 3;
kick 0,5/s burst 6; báo cáo 3/phút burst 3 và 10/giờ burst 10; signaling 40/s burst 120.
RPC trả lỗi nghiệp vụ bằng envelope `_error` để lần thử mã sai cũng tiêu quota,
tránh việc exception rollback luôn bộ đếm. Client đã xử lý envelope này; cần tải lại toàn bộ client sau migration.
Quota dùng khóa hàng và thời gian DB, không tin đồng hồ trình duyệt.
Phía nhận còn giới hạn SDP theo mỗi peer (offer/answer 0,25/s, burst 2) và ICE 10/s, burst 60,
để một peer không liên tục bắt máy khác tạo RTCPeerConnection mới. HTTP signaling/RPC có timeout 10 giây.
Hàng đợi xử lý ghế/trà bánh có trần 64 việc và tối đa 2 việc mỗi peer (tính cả việc đang chạy).
Khi đầy, host trả lời đang bận, không giữ thêm Promise vô hạn trong lúc database chậm.

### Test giai đoạn 7

```bash
npm run build
npm test
npx playwright install chromium
npm run test:safety
npm run test:churn
PEERS=3 npm run test:voice
```

- `test:safety`: 3 người, audio RTP giả lập mic; kiểm tra gain mute, chặn chat/voice hai chiều,
  offer lỗi/PC đóng tự nối lại, reload phòng riêng, mất mạng quá lease rồi phục hồi, báo cáo,
  kick dừng mic và không lách mã mời, checkpoint 30 giây, tắt host giữa chừng và tải lại host mới.
- `test:churn`: đúng 10 người, 3 vòng 9 người rời/vào đồng thời; mỗi vòng phải trở lại đủ 45 link,
  không trùng peer, giữ đồ vật. Sau đó tắt host bất ngờ, 9 người còn lại thống nhất host mới và snapshot.
  Có thể đổi số vòng bằng `CHURN_ROUNDS=5 npm run test:churn`.
- Test SQL chạy phase2/4/7 thật trong PostgreSQL nhúng, kiểm tra RLS, quota, kick, token,
  checkpoint và ngăn host cũ ghi. Chạy lại migration không xóa báo cáo/checkpoint.
- Test trình duyệt dùng API Supabase mô phỏng + SQL/WebRTC thật; không ghi vào dự án Supabase của bạn,
  không dùng micro thật. Ảnh giao diện ở `artifacts/phase7-safety.png`.

Checklist thủ công: vào phòng riêng bằng 2 trình duyệt; thử mã sai; bật mic rồi mute/chặn/bỏ chặn;
gửi báo cáo và xem reports trong Dashboard; host mời một người ra rồi người đó thử mã cũ;
chờ ít nhất 30 giây, tắt hẳn tab host, đợi người còn lại lên host;
tắt Wi-Fi hơn 20 giây rồi bật lại để kiểm tra tự phục hồi; thử lại P2P trên hai mạng khác nhau.

| Lỗi/hiện tượng | Cách xử lý |
| --- | --- |
| Function resume_room/kick_member/save_checkpoint/submit_report not found | Chạy nguyên phase7.sql rồi tải lại mọi tab. |
| Không có khóa phục hồi sau nâng cấp | Rời phòng rồi vào lại một lần sau khi chạy migration. |
| Host mới chưa xuất hiện ngay | Khi tắt tab đột ngột, chờ lease 20 giây + heartbeat; kiểm tra đường tới Supabase. |
| Phiên cũ không tự vào lại | Dùng đúng tab/tài khoản; khóa mất do đóng tab thì vào bằng mã mời. |
| Phòng đang đầy | Chờ có chỗ; không giữ trước ghế/sức chứa cho người đã hết lease. |
| Báo “thao tác quá nhanh” | Chờ quota hồi; không chạy nhiều bài test cloud liên tục trên cùng tài khoản. |
| Tài khoản bị mời khỏi | Tài khoản đó không thể quay lại phòng này bằng mã hoặc khóa phục hồi. |
| Reports không thấy báo cáo người khác | Đây là RLS dự kiến. Quản trị xem trong Supabase Dashboard, không dùng khóa service_role trong .env phía client. |
| WebRTC vẫn thất bại sau thử lại | Kiểm tra signaling/RLS/publication signals và cấu hình TURN nếu NAT/tường lửa cản P2P. |
| Chặn rồi vẫn thấy người trong danh sách | Danh sách giữ mục để bỏ chặn/báo cáo; nhân vật/chat/voice của họ đã bị ẩn/ngắt trên máy bạn. |

Tài liệu API: [Supabase Database Functions](https://supabase.com/docs/guides/database/functions),
[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[WebRTC connectionState](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionState).

## Thiên nhiên: cách dùng

1. Dùng Node từ 22.12 trở lên, chạy `npm install` nếu vừa giải nén dự án, sau đó `npm run dev`.
2. Vào phòng; bảng **Thiên nhiên** ở góc trái. Bấm **Ẩn bảng trò chuyện** để xem rộng hơn.
3. Kéo chuột để xoay, cuộn để tiến gần; có thể pan camera bằng chuột phải. WASD/phím mũi tên đi dạo.
   Vùng đi bộ mở rộng tới ±32 m; bờ nước chặn nhân vật, địa hình tính lại độ cao ở mỗi vị trí.
4. Chọn **Ban ngày** để xem hồ, **Ban đêm** để xem sao/trăng; chọn Nắng/Sương/Mưa nhẹ để thử.
5. Bấm **Bật tiếng thiên nhiên**: tiếng suối, gió, chim và mưa dùng PannerNode HRTF,
   nghe từ đầu nhân vật, hướng camera; nhỏ dần theo khoảng cách. Đi tới suối để nghe rõ hơn.
   Âm thanh môi trường mặc định tắt, không xin quyền mic; có thanh âm lượng riêng.
6. Chọn chất lượng bằng tay hoặc để Tự động. Lựa chọn được lưu trên trình duyệt của bạn.
   Khi FPS dưới 30 kéo dài, bảng hiện gợi ý; Auto hạ từng mức, có thời gian chờ giữa hai lần hạ.
   Chọn tay không tự đổi. Bấm tiêu đề bảng để thu gọn trên màn hình nhỏ.

| Mức | Cỏ / cây tối đa | Bóng | Phản chiếu hồ | DPR tối đa |
| --- | --- | --- | --- | --- |
| Thấp | 2.400 / 66 | Tắt | HDRI, không phản chiếu động cây/người | 1 |
| Vừa | 7.200 / 114 | 1024 | Planar 256 px, cập nhật mỗi 4 lượt vẽ | 1,25 |
| Cao | 14.400 / 174 | 2048 | Planar 512 px, cập nhật mỗi 2 lượt vẽ | 1,75 |

Mật độ là trần sinh cảnh trước culling. Cây có 3 kiểu, 2 LOD; cỏ/hoa chia 16 cụm,
ẩn cụm xa và bật frustum culling theo bounding sphere có nới biên cho gió shader.
Đá, cây, cỏ, hoa, chim, bướm và lá dùng InstancedMesh. Cây ở xa giảm hình học và bỏ bóng.
Gió sửa vertex shader của vật liệu PBR và depth material, giữ bóng cây khớp lá.
Đất có vertex color pha đường mòn/bờ nước, color/normal texture tự sinh.
Hồ có gợn normal theo thời gian; suối là dải nước uốn theo địa hình.

HDRI 1K nằm sẵn trong `public/assets/sky.hdr` (khoảng 1,1 MB), không cần CDN.
Nguồn: [Kloppenheim 06 Pure Sky — Poly Haven](https://polyhaven.com/a/kloppenheim_06_puresky),
Greg Zaal / Jarod Guest, [CC0](https://polyhaven.com/license).
Giấy phép và URL tải gốc ở `public/assets/LICENSES.txt`. Cây/cỏ/động vật/texture và âm thanh
còn lại được sinh bằng code, không có gói asset/âm thanh bên ngoài cần tải thêm.
Đây là cảnh phong cách hóa bằng hình học thủ tục, chưa dùng bộ cây photogrammetry hoặc nhân vật glTF.

Ngày đêm tự động dài 20 phút, thời tiết tự chọn theo các khoảng 3 phút, dựa trên mã phòng
và đồng hồ phòng đã đồng bộ. Mọi người dùng Auto thấy cùng chu kỳ; chuyển tiếp sương/ánh sáng
được làm mềm. Đổi ngày/thời tiết thủ công là tùy chọn xem trên máy của bạn, không đổi phòng.
Không có gói vị trí/thời tiết mới qua Supabase; các cơ chế host/P2P giữ nguyên.

FPS và thống kê lượt vẽ/tam giác chỉ là chỉ báo tại camera hiện tại. Mục tiêu 60 FPS máy tính /
30 FPS điện thoại phải đo trên thiết bị thật; không thể kết luận từ Chromium headless.
Thống kê renderer hiển thị lượt vẽ chính, không phải tổng GPU cost của shadow/reflection pass.
Khởi tạo shader/HDRI có thể làm FPS giảm trong vài giây đầu; Auto chờ trước khi hạ mức.

### Kiểm thử giai đoạn 6

```bash
npm run build
npm test
npx playwright install chromium
npm run test:nature
PEERS=3 npm run test:local
PEERS=3 npm run test:voice
```

`test:nature` mở 3 context với backend offline của bộ test trước; chỉ context đầu dựng 3D.
Kiểm tra 3 chất lượng, nắng/sương/mưa, ngày/đêm, HRTF, bật/tắt tiếng, đóng AudioContext
khi rời phòng, lỗi JS/shader. Ảnh kiểm tra ở `artifacts/phase6-*.png`.
Đây không phải benchmark GPU hay kiểm thử Supabase cloud thật. Các test thuần kiểm tra vùng nước,
độ cao bàn, giới hạn vị trí, seed/chu kỳ trời và chính sách Auto/manual.

Checklist thủ công: hai trình duyệt cùng vào phòng; cùng bật Auto để đối chiếu trời;
chọn Ban ngày/Nắng để xem đường mòn, cây, hoa và gợn nước; đổi Vừa/Cao để xem phản chiếu;
đi sát bờ hồ và suối; xoay camera nghe tiếng 3D; thử 3 mức trên điện thoại thật;
kiểm tra chat, emote, trà bánh và mic khi cảnh vẫn chạy.

| Hiện tượng mới | Cách xử lý |
| --- | --- |
| Cảnh tối | Chọn Ban ngày + Nắng trong bảng Thiên nhiên. |
| FPS thấp | Chọn Thấp hoặc Auto, đóng tab 3D khác, bật tăng tốc phần cứng; giảm voice xuống 8 nếu nhiều người. |
| Hồ không soi cây/người | Chọn Vừa/Cao; Thấp chủ động dùng phản chiếu HDRI để giảm tải. |
| HDRI không tải / 404 | Giữ nguyên file public/assets/sky.hdr khi copy/giải nén; kiểm tra Network. Nếu lỗi vẫn còn, cảnh còn đèn dự phòng. |
| Không nghe suối/chim | Bấm Bật tiếng thiên nhiên, tăng âm lượng, kiểm tra loa/tab; tới gần suối và chọn Ban ngày để nghe chim. |
| Bảng che cảnh trên điện thoại | Thu gọn tiêu đề Thiên nhiên và bấm Ẩn bảng trò chuyện. |
| Máy khác có thời tiết khác | Cả hai chọn thời tiết/ngày đêm Auto; các lựa chọn thủ công chỉ áp dụng máy đó. |
| Peer cũ không thấy người đi xa | Tải lại mọi tab để cùng dùng giới hạn vị trí mới của giai đoạn 6. |

Đối chiếu API: [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html),
[LOD](https://threejs.org/docs/pages/LOD.html), [Reflector](https://threejs.org/docs/pages/Reflector.html),
[Drei Environment](https://drei.docs.pmnd.rs/staging/environment).

## Voice: cách dùng nhanh

1. Vào phòng, mở phần **Giọng nói** trong bảng bên phải (cuộn bảng nếu cần).
2. Bấm **Bật mic** rồi cho phép trình duyệt dùng micro. Trước khi bấm, ứng dụng không thu âm.
3. Bấm **Tắt mic** để dừng track thu âm và ngừng gửi tiếng của mình; vẫn nghe người khác.
4. **Chỉ nghe** bật loa mà không xin quyền mic. Nếu từ chối quyền mic, bạn vẫn có thể nghe.
5. Chọn micro trong danh sách để đổi thiết bị. Đổi thất bại sẽ giữ micro cũ nếu nó vẫn hoạt động.
6. Chọn giới hạn 8/10/12 người, mặc định 10. Người cùng bàn được ưu tiên, sau đó đến người gần nhất.
7. **Rời voice** ngắt audio và dừng mic, vẫn ở phòng để chat/đi lại/dùng trà bánh.
8. Rời phòng, đăng xuất, mất phiên phòng: micro và kết nối audio được dọn tự động.

Micro cần HTTPS hoặc `http://localhost`. Địa chỉ HTTP theo IP LAN trên điện thoại không phải secure context;
muốn dùng mic trên điện thoại cần truy cập qua HTTPS. Dùng tai nghe khi thử hai trình duyệt/máy gần nhau để tránh hú.

### Cách voice hoạt động

- Vị trí/chat/đồ vật vẫn dùng DataChannel full-mesh cũ. Voice dùng RTCPeerConnection audio riêng,
  chỉ mở cho các cặp gần nhau; không thêm audio vào toàn bộ full-mesh.
- SDP/ICE của voice đi qua DataChannel `events` sẵn có, không ghi vào Supabase.
  Supabase tiếp tục phục vụ signaling kết nối data ban đầu và snapshot như các giai đoạn trước.
- Bán kính nghe 12 m. Kết nối mới mở khi vào 11,5 m, giữ đến 12 m để tránh bật/tắt liên tục ở mép vùng.
  Trong hai mét cuối, âm lượng giảm về 0; vượt 12 m thì đóng audio PC thật, không chỉ tắt gain.
- Mỗi máy ưu tiên mọi người cùng bàn đang tham gia voice (tối đa 7 người), rồi sắp theo khoảng cách.
  Muốn mở một cặp thì cả hai phải chọn nhau, bảo đảm cả hai đầu giữ được trần 8/10/12.
  Có thể có ít kết nối hơn trần nếu đầu bên kia đang đầy. Người không bật voice không tự phát loa.
- Giới hạn tính bằng số peer audio song công: tối đa N người nghe/nói, mỗi phía tối đa N track nhận
  và N bản mic gửi. Đóng người bị loại trước khi mở người mới, kể cả khi đổi giới hạn trong lúc đang nói.
- Hai người đều tắt mic không cần audio PC; người tắt mic vẫn có thể nhận tiếng của người đang bật mic.
- Mỗi remote track đi qua MediaStreamAudioSourceNode → PannerNode HRTF → GainNode → loa.
  Vị trí nghe theo đầu nhân vật, hướng nghe theo góc camera; tiếng nhỏ dần theo khoảng cách.
  Không phát tiếng mic của mình vào loa. Media element hỗ trợ nhận track được mute để tránh phát tiếng hai lần.
- `getUserMedia` yêu cầu echoCancellation, noiseSuppression, autoGainControl, mono, ưu tiên 48 kHz.
  Đây là xử lý sẵn có của trình duyệt, mức hỗ trợ và chất lượng phụ thuộc thiết bị/trình duyệt.
- Đổi mic dùng `replaceTrack`; chỉ sau khi gắn mic mới mới dừng mic cũ. Nếu cần, chỉ khởi tạo lại audio PC,
  giữ nguyên các kết nối dữ liệu. Hủy xin quyền hoặc rời phòng trong lúc chờ sẽ dừng stream được cấp muộn.
- Nhận dạng đang nói dùng RMS với ngưỡng và thời gian giữ ngắn, không tải mô hình hay gửi PCM qua DataChannel.
  Biểu tượng micro sáng/nhấp nháy trên đầu nhân vật, danh sách người cũng hiện **Đang nói**.
- Khi micro bị tháo, track kết thúc hoặc quyền bị thu hồi, dừng phát và báo chọn thiết bị khác.
  Nếu trình duyệt tạm dừng AudioContext, bấm **Bật loa** để tiếp tục.
- Yêu cầu bitrate mic khoảng 24 kb/s trên mỗi sender khi trình duyệt cho phép cấu hình Opus;
  số đo thực tế có thể khác do codec và overhead.
- Băng thông cập nhật mỗi hai giây từ `getStats()` của candidate pair đang được chọn, lấy delta byte/thời gian.
  Hiện riêng **Voice** và **Dữ liệu P2P**, đơn vị kb/s. Không gồm tải trang, HTTP hay signaling Supabase.
  Mỗi kết nối/generation có baseline riêng, không tạo số tăng giả khi ngắt/nối lại.

### Test voice

Thủ công: hai máy hoặc hai trình duyệt vào cùng phòng, bấm Bật mic/Chỉ nghe.
Đi gần/xa để nghe thay đổi âm lượng và ngắt ngoài vùng; xoay camera để kiểm tra trái/phải.
Ngồi cùng bàn rồi thử với nhiều người đi quanh; người cùng bàn vẫn được ưu tiên.
Thử từ chối quyền, đổi thiết bị, tắt mic, và rời phòng; kiểm tra biểu tượng mic của hệ điều hành đã tắt.

```bash
npx playwright install chromium
PEERS=3 npm run test:voice
npm run test:voice
PEERS=3 RENDER_3D=1 RENDER_ONE=1 npm run test:voice
```

`test:voice` mặc định 10 browser context, mic giả và âm thanh tổng hợp trong `artifacts/fake-microphone.wav`.
Nó dùng audio RTP/Web Audio thật nhưng backend Supabase mô phỏng; từ chối quyền và lỗi thiết bị được giả lập.
Không xin quyền hoặc dùng micro thật của máy kiểm thử. RENDER_ONE chỉ dựng cảnh đầu tiên để giảm tải đồ họa.
Bài test xác minh: chỉ nghe không xin mic, audio nhận/gửi, PannerNode HRTF, trạng thái nói, băng thông,
mute dừng capture/sender, đổi track, giữ mic cũ khi đổi thất bại, đi xa/ngược lại gần,
trần 8 người, ưu tiên cùng bàn và dừng mic khi rời phòng. Nghe bằng thiết bị thật vẫn cần kiểm tra thủ công.

Với Supabase đã cấu hình và Vite đang chạy, test voice cùng mic giả trên backend thật bằng:

```bash
VOICE_TEST=1 PEERS=3 npm run test:peers
```

## 1. Chuẩn bị Supabase

1. Dùng Node LTS từ 22.12 trở lên. Chạy `node --version` để kiểm tra.
2. Tạo dự án tại https://supabase.com/dashboard.
3. Với dự án mới: trong SQL Editor chạy **toàn bộ** `supabase/phase2.sql` một lần,
   sau đó chạy **toàn bộ** `supabase/phase4.sql`. Phase2 không chạy lặp lại vì sẽ trùng bảng/policy/publication.
4. Authentication → Sign In / Providers → bật Anonymous Sign-Ins.
5. Để dùng email, bật Email provider. Trong URL Configuration, đặt Site URL là
   `http://localhost:5173`, thêm URL này vào Redirect URLs. Nếu dùng IP/port khác,
   cập nhật đúng địa chỉ đó. Mặc định dùng liên kết đăng nhập gửi qua email.
   Nếu muốn nhập mã OTP, email template cần chứa `{{ .Token }}`.
6. Sao chép Project URL và publishable key từ phần Connect/API Keys của dự án.
   Không dùng secret key hay service_role key trong ứng dụng.
7. Sao chép `.env.example` thành `.env`, điền hai biến Supabase.
8. Publication `supabase_realtime` phải có **signals**. File SQL đã thêm bảng này.
   Không bật Realtime cho vị trí, profiles hoặc rooms.

```bash
npm install
cp .env.example .env
# Mở .env trong trình soạn thảo để điền URL và publishable key.
npm run dev
```

## 2. Cách hoạt động

- Mỗi lần vào phòng có UUID peer riêng; danh tính Supabase và peer là hai khái niệm khác nhau.
- `profiles`: mỗi tài khoản chỉ đọc/sửa hồ sơ của mình. Tên hiển thị được sao chép vào thành viên phòng khi vào.
- `rooms.members`: danh sách peer, user sở hữu, thứ tự vào và hạn heartbeat. Không có vị trí nhân vật.
- `rooms`: chỉ cho client SELECT các cột công khai an toàn của phòng công khai.
  Mã mời có 128 bit ngẫu nhiên; DB chỉ lưu hash, không trả mã qua danh sách phòng.
- Các RPC SECURITY DEFINER kiểm tra `auth.uid()`, có search_path cố định và khóa hàng phòng.
  Không cho client tự UPDATE rooms, tự thêm thành viên hoặc tự đặt host.
- Heartbeat REST mỗi 4 giây, lease 20 giây. Người có `join_order` nhỏ nhất còn sống làm host.
  `host_epoch` thay đổi khi đổi host; snapshot từ nhiệm kỳ cũ bị bỏ.
- Bấm Rời phòng: cập nhật ngay; các peer khác biết trong một chu kỳ heartbeat.
  Đóng tab/tắt mạng: khoảng 20–24 giây sau heartbeat cuối, peer khác loại host và bầu người mới.
  Tab ngủ quá lâu có thể hết lease; hãy rời rồi vào lại.
- WebRTC kết nối mọi cặp peer: N người có N×(N−1)/2 kết nối. Chỉ peer có UUID lớn hơn tạo offer.
  ICE được xếp hàng nếu đến trước SDP; peer chủ động thử kết nối lại khi thất bại.
- `signals` chỉ chứa offer/answer/candidate. Realtime báo INSERT cho đúng người nhận,
  kèm truy vấn REST đọc bù để không mất signaling khi reconnect websocket.
  RLS chỉ cho thành viên gửi bằng peer mình sở hữu tới thành viên cùng phòng.
  Người nhận xóa signal đã xử lý; heartbeat xóa signal cũ hơn 2 phút trong phòng đang hoạt động.
- Kênh `poses`: `ordered:false,maxRetransmits:0`, tối đa 10 lần/giây khi dữ liệu đổi.
  Gói có sequence; bên nhận bỏ gói cũ, nội suy trễ 120ms và xoay theo cung ngắn nhất.
  Mẫu ban đầu và chuyển trạng thái animation còn gửi qua kênh tin cậy để tránh mất mẫu dừng cuối cùng.
- Kênh `events`: có thứ tự, đáng tin cậy; dùng cho yêu cầu ghế, kết quả, snapshot và mẫu khởi tạo.
- Host xử lý yêu cầu ghế nối tiếp, kiểm tra một người/một ghế và một ghế/một người.
  Snapshot ghế được commit bằng so sánh revision + epoch trước khi báo thành công cho cả phòng.
  Host mới lấy snapshot đã lưu. Người mới nhận snapshot ghế từ host qua DataChannel;
  từng peer gửi mẫu vị trí ban đầu trực tiếp cho người mới.
- Hoạt ảnh đứng/đi/ngồi và bốn emote đều dùng nhân vật hình khối;
  chưa có asset/clip glTF trong giai đoạn này.

### Chat và emote

- Chat đi qua kênh `events` tin cậy của full-mesh, không đi qua Supabase và không lưu DB.
- Nhập chat ở góc dưới trái, Enter hoặc bấm Gửi. Trong lúc bộ gõ tiếng Việt đang ghép chữ,
  Enter không tự gửi nhầm. Đang gõ chat thì WASD và phím emote không điều khiển nhân vật.
- Tối đa 200 Unicode code point sau chuẩn hóa NFC; emoji đơn tính là một ký tự.
  Emoji ghép có thể chứa nhiều code point. Input hiển thị số ký tự và khóa Gửi khi vượt giới hạn.
- Mỗi người chỉ gửi một tin mỗi giây. Cả bên gửi lẫn bên nhận đều kiểm tra tốc độ,
  độ dài, ID trùng và định dạng gói. Giới hạn độc lập cho từng peer.
- `BLOCKED_WORDS` trong `src/network/social.ts` là danh sách lọc cơ bản;
  thay cả từ thành dấu *, không tìm chuỗi con trong từ dài. Có thể thêm từ tại đây.
- Tên và tin nhắn vẽ lên CanvasTexture, không đưa nội dung người dùng vào HTML.
- Bong bóng hiện trên đầu, quay theo camera và giữ cỡ chữ dễ đọc khi thu/phóng.
  Tin mới nằm dưới, tin cũ được đẩy lên; tối đa sáu tin đang hiện mỗi người.
  Mỗi tin giữ rõ 4,5 giây, mờ dần trong 1,5 giây cuối và bị xóa sau 6 giây.
- Phím 1 = vẫy tay, 2 = cười, 3 = gật đầu, 4 = vỗ tay; có nút tương ứng trên màn hình.
  Emote có cooldown 0,5 giây để tránh spam; emote mới thay emote đang chạy.
  Gói P2P mang loại emote; mọi máy phát cùng hàm animation từ thời điểm nhận.
  Chuyển động vào/ra mềm trong 180ms, vẫn dùng được lúc đứng, đi hoặc ngồi.
- Bảng Người trong phòng hiện tên, host, kết nối, tư thế và emote đang phát.
- Chat và emote là sự kiện tạm thời của những người đang kết nối; không phát lại lịch sử cho người mới.

### Trà và bánh

- Bấm ghế để ngồi, mở phần **Trà và bánh** trong bảng bên phải (cuộn nếu cần).
  Chỉ người đang ngồi được dùng đồ trên bàn. Mỗi ghế có một ly và mỗi người cầm một món ăn.
- Ấm bắt đầu với 2400 ml; ly chứa tối đa 200 ml; mỗi lần rót tối đa 150 ml.
  **Mời bên trái/phải** chỉ dùng được khi ghế liền kề có người, kể cả hai ghế 0 và 7.
- Rót diễn ra 1,8 giây. Host giữ chỗ lượng trà ngay khi chấp nhận; mực ly tăng theo thời gian.
  Một ấm chỉ được một người dùng tại một thời điểm, cùng ly không được uống/đổ/rót chồng nhau.
- **Uống trà** giảm dần tối đa 80 ml trong 2,2 giây; **Đổ bỏ trà** làm ly rỗng trong 1,2 giây.
  Ly được nhấc vào tay khi uống/đổ; ấm di chuyển/nghiêng khi rót, có dòng trà.
- Đĩa có 12 bánh và 16 kẹo. **Lấy bánh/Lấy kẹo** trừ một món, **Ăn** hoặc **Vứt vào thùng** bỏ món khỏi tay.
  Đồ ăn không được cộng trở lại đĩa. Khi vứt, món ăn bay theo quỹ đạo vào thùng cạnh bàn.
- Nhiệt độ giảm theo hàm mũ về 22°C, không cần gửi từng frame qua mạng.
  Hơi nóng nhạt dần và hết khi trà xuống khoảng 40°C. Trà trong ly gần nhiệt độ phòng sau khoảng 90 giây.
  Ấm nguội chậm hơn ly. Không tự nạp lại trà/bánh khi hết; tạo phòng mới để có bộ đồ mới.
- Mỗi thao tác có chuyển động tay/đầu và âm thanh nhỏ, tổng hợp bằng Web Audio tại máy.
  Âm thanh tự mở sau thao tác chuột/phím đầu tiên trong phòng; có nút bật/tắt.
  Trình duyệt chặn tự phát trước thao tác người dùng; không cần tải file âm thanh hay xin quyền mic.
- Âm thanh giảm theo khoảng cách, ngoài 10 m thì không phát. Mỗi ID hành động chỉ phát một lần trên một máy.
- Trong lúc thao tác trà/bánh, không đổi ghế; animation trà/bánh được ưu tiên hơn emote.
  Khi rời ghế/phòng, ly và đồ cầm của người cũ được dọn; ấm và đĩa giữ nguyên lượng còn lại.

### Hai người thao tác cùng lúc và host rời

1. Người chơi gửi `table-request` qua DataChannel tin cậy cho host, kèm UUID và số thứ tự theo peer.
2. Host dùng **cùng một hàng đợi nối tiếp** cho ghế và trà/bánh. Mỗi yêu cầu đọc trạng thái mới nhất,
   kiểm tra ghế, đồ đang bận, lượng còn và món đang cầm. Người gửi được lấy từ kết nối P2P.
3. Ví dụ còn một bánh: yêu cầu được xử lý trước lấy bánh; yêu cầu sau nhìn thấy số lượng 0 và bị từ chối.
   Hai người lấy hai món khác nhau vẫn có thể thành công; cả hai lần giảm đều được giữ.
4. Host gọi `commit_table` để lưu snapshot. Postgres khóa hàng phòng và so sánh **revision + host_epoch**;
   snapshot cũ hoặc host cũ không được ghi đè. Chỉ host được gọi RPC này.
5. Chỉ sau commit thành công host mới gửi snapshot và kết quả cho mọi người; không cập nhật lạc quan rồi hoàn tác.
   Supabase chỉ lưu snapshot khi có hành động, không gửi vị trí/mực trà/hơi nóng từng frame.
6. Snapshot chứa mốc thời gian và đường chuyển mức ly. Host gửi đồng hồ qua P2P mỗi giây;
   các máy tính animation/nhiệt độ tại chỗ, không dựa vào đồng hồ hệ điều hành riêng.
7. Snapshot giữ số thứ tự yêu cầu cuối của từng peer. Nếu mất phản hồi, bấm **Thử lại yêu cầu vừa rồi**;
   host nhận cùng yêu cầu sẽ trả trạng thái/kết quả mà không trừ đồ lần nữa.
   Yêu cầu cũ hơn số thứ tự đã xử lý bị từ chối.
8. Host mới nhận snapshot đã lưu, giữ nguyên ấm, ly, bánh, đồ cầm và số thứ tự yêu cầu của người còn trong phòng.
   Thời gian nguội được nối tiếp từ mốc server. Bấm thử lại nếu đang chờ phản hồi lúc đổi host.

## 3. Test thủ công bằng hai trình duyệt trên một máy

1. Chạy Vite; mở `http://localhost:5173` trong Chrome và Firefox hoặc Edge.
2. Cả hai chọn **Vào ẩn danh**, đặt tên A/B. Auth dùng sessionStorage theo tab.
3. A tạo phòng riêng, tối đa 2 người. Sao chép mã mời hiển thị trong phòng.
4. B nhập mã; cả hai phải hiện **2 thành viên**, **1/1 kết nối P2P**, snapshot đã có revision.
5. A đi bằng WASD, B quan sát; đổi lại. Kéo chuột để đổi camera.
   Sau khi bấm nút, bấm lại vùng cảnh trước khi dùng phím di chuyển.
6. Hai người bấm cùng một ghế: chỉ một người được ngồi, hai bên hiển thị cùng chủ ghế.
7. Người thắng bấm Đứng dậy; người còn lại ngồi ghế đó.
8. A rời, B thành host. Test lại bằng cách A đóng tab đột ngột, chờ 20–24 giây.
9. Người thứ ba vào bằng mã: nhận ghế đang chiếm và nhìn thấy vị trí các thành viên.
10. Tạo phòng công khai và kiểm tra trong danh sách sảnh; phòng riêng không được liệt kê.
11. Giới hạn phòng 2 người: lần vào thứ ba phải báo đầy.
12. Supabase Table Editor: vị trí không xuất hiện trong rooms/signals; signals chỉ có SDP/ICE.
13. A gửi hai tin cách nhau hơn một giây: B thấy hai bong bóng xếp chồng trên đầu A.
    Mỗi bong bóng phải tự mờ và biến mất sau 6 giây kể từ lúc xuất hiện.
14. Gửi hai lần liên tiếp: lần thứ hai bị chặn và giữ nguyên bản nháp để thử lại sau.
    Nhập 201 ký tự: Gửi bị khóa. Thử emoji và tiếng Việt có dấu.
15. Gửi một từ nằm trong BLOCKED_WORDS: các máy đều thấy dấu *.
16. Bấm 1–4 và bốn nút emote: cả hai phía thấy tay/đầu chuyển động tương ứng rồi trở về tư thế nghỉ.
17. Gõ số 1–4 trong ô chat: không phát emote. Thử emote lúc đang ngồi.
18. Xoay/thu phóng camera: tên và bong bóng vẫn hướng về camera, chữ vẫn đọc được.
19. Người vào/rời: danh sách người cập nhật theo cơ chế thành viên của giai đoạn 2.
20. A và B ngồi ghế liền kề. Rót cho mình rồi mời người cạnh: cả hai máy hiện cùng lượng trà còn trong ấm/ly.
21. Hai người cùng dùng ấm: chỉ một người rót tại một thời điểm; yêu cầu còn lại được báo chờ/thử lại.
22. Uống thấy mực trà giảm từ từ; đổ thấy ly về 0; thử lại khi ly rỗng phải bị chặn.
23. Lấy bánh/kẹo thấy số lượng giảm và món ở tay. Ăn/vứt thấy món mất khỏi tay, không hoàn lại đĩa.
24. Chờ trà nguội: số °C giảm và hơi nóng mất dần. Thử tắt/bật âm thanh và nghe trên cả hai máy.
25. Người mới vào thấy đúng ấm/ly/đĩa hiện tại. Host rời: người còn lại giữ đúng đồ và lượng trà.
26. Mất phản hồi rồi thử lại cùng yêu cầu: không bị trừ hai lần. Không đổi ghế khi đang uống/rót/ăn.

## 4. Test tự động

```bash
npm test
npm run build
npx playwright install chromium
```

`npm test` kiểm tra ghế, sequence, nội suy, chat/emote, luật trà/bánh và chạy SQL trong PostgreSQL nhúng PGlite.
Phần SQL mô phỏng auth schema/role có sẵn của Supabase để kiểm tra policy và RPC;
không kiểm tra dịch vụ Supabase Realtime thật.

Test 10 peer với dự án Supabase của bạn: bật anonymous auth, điền .env, chạy Vite
trong một Terminal, mở Terminal thứ hai:

```bash
npm run test:peers
```

Script mở 10 browser context tách biệt, tạo 10 người dùng ẩn danh và một phòng riêng.
Nó kiểm tra đủ 45 kết nối thật, snapshot, tranh ghế, gửi/nhận vị trí,
chat đã lọc, giới hạn tốc độ/độ dài, tin xếp chồng, bốn emote qua nút/phím,
tranh ấm, rót/mời/uống/đổ, lấy/ăn/vứt bánh kẹo, đồng bộ snapshot,
host rời chủ động và host đóng đột ngột, giữ trà/đồ cầm qua đổi host.
Script có thể mất vài phút tùy máy/mạng.
Mặc định test không dựng Canvas để chỉ đo tải mạng. Chế độ này chỉ có ở Vite dev;
chạy với RENDER_3D=1 để kiểm tra cả cảnh 3D. Với bản build/preview, cảnh 3D luôn được dựng.

```bash
PEERS=3 npm run test:peers
HEADED=1 PEERS=3 npm run test:peers
RENDER_3D=1 PEERS=3 npm run test:peers
APP_URL=http://localhost:5174 npm run test:peers
```

Không có Supabase vẫn có thể test mạng cục bộ:

```bash
npm run test:local
```

Lệnh này tự mở Vite ở 5175, dùng PostgreSQL nhúng và WebRTC thật giữa 10 context,
nhưng mô phỏng API Auth/PostgREST và handshake Realtime. Signaling được chuyển qua
cơ chế REST đọc bù; vì vậy kết quả này không chứng minh Supabase Realtime thật hoạt động.
Không dùng khóa Supabase thật, không tạo user trong dự án Supabase của bạn.
Test này cũng kiểm tra đường phục hồi signaling khi không nhận được thông báo websocket.

## 5. STUN và TURN

`src/network/config.ts` có STUN công cộng. STUN không chuyển tiếp dữ liệu.
Một số mạng NAT/tường lửa hạn chế cần TURN mới kết nối được; không thể bảo đảm
P2P giữa mọi mạng chỉ bằng STUN. TURN là máy chuyển tiếp lưu lượng khi không đi trực tiếp được.

Chỗ thêm TURN đã có trong `.env.example`:

```dotenv
VITE_TURN_URLS=turn:your-turn.example:3478,turns:your-turn.example:5349
VITE_TURN_USERNAME=
VITE_TURN_CREDENTIAL=
```

Đây là cấu hình phát triển. Khi phát hành cần credential ngắn hạn;
mọi giá trị VITE_ đều có thể đọc được từ trình duyệt.

## 6. Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| Nút ẩn danh bị vô hiệu | Điền .env rồi dừng/chạy lại Vite. |
| Anonymous sign-ins are disabled | Bật Anonymous Sign-Ins trong Supabase Auth. |
| Function/table not found | Chạy nguyên phase2.sql trong đúng dự án Supabase. |
| SQL báo bảng đã tồn tại | SQL chạy một lần cho dự án mới; không chạy lại hay xóa dữ liệu hiện có. |
| Email chưa đến / rate limit | Kiểm tra spam, cấu hình Email/SMTP và chờ hết giới hạn Auth. |
| P2P mãi 0/N | Kiểm tra publication signals, RLS, websocket và Console; thử cùng Wi-Fi. NAT hạn chế cần TURN. |
| Phiên phòng hết hạn | Tab/máy đã ngủ hoặc mất mạng quá 20 giây; rời rồi vào lại. |
| Gửi chat báo chờ kết nối | Chờ đủ N−1 kết nối P2P; kiểm tra signaling nếu một peer mãi chưa kết nối. |
| Gửi liên tiếp bị chặn | Chờ ít nhất một giây, giữ bản nháp rồi bấm Gửi lại. |
| Chờ mãi snapshot trà/bánh | Chạy phase4.sql sau phase2.sql, mở lại các tab và vào lại phòng. |
| Bấm thao tác đồ trên bàn bị khóa | Phải ngồi; chờ thao tác đang chạy/ấm đang bận. Ly đầy, ly rỗng hoặc tay đang cầm đồ cũng khóa thao tác tương ứng. |
| Không nghe âm thanh | Chạm/bấm trong phòng rồi dùng Bật âm thanh; kiểm tra tab/thiết bị có tắt tiếng không. |
| Chưa nhận host xác nhận | Chờ chuyển host rồi bấm Thử lại yêu cầu vừa rồi; không cần tạo yêu cầu mới. |
| Bấm 1–4 không phát emote | Nếu đang nhập chat, bấm vùng cảnh trước; hoặc dùng nút emote. |
| Bong bóng đã biến mất | Tin nhắn tự hết hạn sau 6 giây, không phải lịch sử chat được lưu. |
| Tạo user test bị 429 | Anonymous Auth có rate limit; chờ rồi chạy lại, không lặp test liên tục. |
| Playwright không tìm thấy browser | Chạy npx playwright install chromium. |
| 10 peer làm máy chậm | Chạy PEERS=3 trước; giữ RENDER_3D mặc định. Bài test mạng không phải bài đo FPS sản phẩm. |
| Vite báo chunk lớn | Cảnh báo dung lượng Three.js; build vẫn thành công. |
| EBADENGINE | Nâng Node lên LTS từ 22.12 trở lên. |
| Mic báo cần HTTPS | Dùng localhost trên máy tính hoặc HTTPS trên điện thoại; HTTP bằng IP LAN không đủ. |
| Bị từ chối quyền mic | Bật quyền micro cho trang trong trình duyệt và quyền micro của trình duyệt trong hệ điều hành rồi bấm Bật mic lại; vẫn dùng Chỉ nghe được. |
| Không nghe người ở xa | Trong phạm vi 12 m hoặc cùng bàn; hai bên phải tham gia voice và còn chỗ trong giới hạn. |
| Mic bật nhưng loa bị tạm dừng | Bấm Bật loa, kiểm tra tab/thiết bị có tắt tiếng hay không. |
| Đổi mic báo lỗi | Chọn Micro mặc định hoặc cắm lại thiết bị; nếu mic cũ còn hoạt động ứng dụng giữ nguyên nó. |
| Voice không nối nhưng data vẫn chạy | Kiểm tra STUN/TURN và tường lửa; voice là audio PC riêng nên có thể cần TURN trên mạng hạn chế. |

## Tài liệu đối chiếu

- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/docs/guides/realtime/postgres-changes
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel
- https://playwright.dev/docs/browser-contexts
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack
- https://developer.mozilla.org/en-US/docs/Web/API/PannerNode
