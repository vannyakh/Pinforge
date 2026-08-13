import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Message, Select, Spin } from "@arco-design/web-react";
import { Refresh } from "@icon-park/react";
import type { MetaPhotoAlbumDestination } from "@common/publish/types";
import PostBuilderLabelHelp from "@renderer/components/publish/PostBuilderLabelHelp";
import { api, type MetaPageAlbumSummary } from "@renderer/api";
import { useMetaPublishStore } from "@renderer/pages/publish/metaPublishStore";

const DESTINATION_OPTIONS: Array<{ label: string; value: MetaPhotoAlbumDestination }> = [
  { label: "Page feed (multi-photo post)", value: "feed" },
  { label: "Facebook Album", value: "facebook_album" },
];

const CREATE_NEW_VALUE = "__create_new__";

const DESTINATION_HINTS: Record<MetaPhotoAlbumDestination, string> = {
  feed: "One feed post with multiple photos via attached_media (Meta Page Photos API).",
  facebook_album: "Upload each photo to a Facebook Album via POST /{album-id}/photos.",
};

type MetaPhotoAlbumTargetProps = {
  connected: boolean;
};

const MetaPhotoAlbumTarget: React.FC<MetaPhotoAlbumTargetProps> = ({ connected }) => {
  const photoAlbumDestination = useMetaPublishStore((s) => s.photoAlbumDestination);
  const photoAlbumFacebookId = useMetaPublishStore((s) => s.photoAlbumFacebookId);
  const photoAlbumNewName = useMetaPublishStore((s) => s.photoAlbumNewName);
  const setPhotoAlbumDestination = useMetaPublishStore((s) => s.setPhotoAlbumDestination);
  const setPhotoAlbumFacebookId = useMetaPublishStore((s) => s.setPhotoAlbumFacebookId);
  const setPhotoAlbumNewName = useMetaPublishStore((s) => s.setPhotoAlbumNewName);

  const [albums, setAlbums] = useState<MetaPageAlbumSummary[]>([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [createNewAlbum, setCreateNewAlbum] = useState(false);

  const loadAlbums = useCallback(async () => {
    if (!connected) return;
    setLoadingAlbums(true);
    try {
      setAlbums(await api.listMetaPageAlbums(50));
    } catch (err) {
      Message.error(err instanceof Error ? err.message : String(err));
      setAlbums([]);
    } finally {
      setLoadingAlbums(false);
    }
  }, [connected]);

  useEffect(() => {
    if (photoAlbumDestination !== "facebook_album" || !connected) return;
    void loadAlbums();
  }, [photoAlbumDestination, connected, loadAlbums]);

  const albumSelectValue = useMemo(() => {
    if (createNewAlbum || photoAlbumNewName.trim()) return CREATE_NEW_VALUE;
    return photoAlbumFacebookId.trim() || undefined;
  }, [createNewAlbum, photoAlbumFacebookId, photoAlbumNewName]);

  const albumOptions = useMemo(
    () => [
      { label: "Create new album…", value: CREATE_NEW_VALUE },
      ...albums.map((album) => ({
        label: album.photoCount != null ? `${album.name} (${album.photoCount})` : album.name,
        value: album.id,
      })),
    ],
    [albums]
  );

  const facebookAlbumHint = connected
    ? "Caption applies to the first photo. Additional photos use no_story to avoid extra feed posts."
    : "Connect Meta and select a Page in Settings to list albums.";

  return (
    <section className="post-builder__section">
      <PostBuilderLabelHelp
        label="Publish destination"
        hint={DESTINATION_HINTS[photoAlbumDestination]}
      />
      <Select
        value={photoAlbumDestination}
        onChange={(v) => setPhotoAlbumDestination(v as MetaPhotoAlbumDestination)}
        options={DESTINATION_OPTIONS}
      />

      {photoAlbumDestination === "facebook_album" ? (
        <div className="photo-post-builder__album-target mt-10px">
          <div className="post-builder__section-head mb-6px">
            <PostBuilderLabelHelp
              label="Facebook Album"
              hint={facebookAlbumHint}
              className="post-builder__label mb-0"
            />
            <button
              type="button"
              className="post-builder__caption-suggest-add"
              title="Refresh albums"
              aria-label="Refresh albums"
              disabled={!connected || loadingAlbums}
              onClick={() => void loadAlbums()}
            >
              {loadingAlbums ? (
                <Spin size={14} />
              ) : (
                <Refresh theme="outline" size="16" fill="currentColor" />
              )}
            </button>
          </div>
          {connected ? (
            <>
              <Select
                placeholder="Select an album or create new"
                value={albumSelectValue}
                onChange={(v) => {
                  if (v === CREATE_NEW_VALUE) {
                    setCreateNewAlbum(true);
                    setPhotoAlbumFacebookId("");
                    return;
                  }
                  setCreateNewAlbum(false);
                  setPhotoAlbumFacebookId(String(v));
                }}
                options={albumOptions}
                loading={loadingAlbums}
                allowClear
                onClear={() => {
                  setCreateNewAlbum(false);
                  setPhotoAlbumFacebookId("");
                  setPhotoAlbumNewName("");
                }}
              />
              {createNewAlbum || photoAlbumNewName.trim() ? (
                <Input
                  className="mt-8px"
                  value={photoAlbumNewName}
                  onChange={setPhotoAlbumNewName}
                  allowClear
                  placeholder="New album name"
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default MetaPhotoAlbumTarget;
