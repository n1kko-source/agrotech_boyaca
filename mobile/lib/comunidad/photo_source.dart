import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

import 'offer_fields.dart';

abstract class PhotoSource {
  Future<List<Uint8List>> pick({int maxCount = postPhotosMax});
}

/// Compresses at pick time (1280 px, JPEG quality 70) before the post is
/// enqueued. Bytes stay in SQLite; they are not sent on `POST /sync`.
class ImagePickerPhotoSource implements PhotoSource {
  ImagePickerPhotoSource({ImagePicker? picker})
    : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<List<Uint8List>> pick({int maxCount = postPhotosMax}) async {
    final files = await _picker.pickMultiImage(
      maxWidth: 1280,
      maxHeight: 1280,
      imageQuality: 70,
      limit: maxCount,
    );
    final out = <Uint8List>[];
    for (final file in files.take(maxCount)) {
      out.add(await file.readAsBytes());
    }
    return out;
  }
}
